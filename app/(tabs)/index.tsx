// Cleaned up on 2026-06-03
import { decode } from "base64-arraybuffer";
import { CameraView, useCameraPermissions } from "expo-camera";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || "";

// ─── TYPES ───────────────────────────────────────────────────────────────────

type Screen =
  | "name"
  | "scanner"
  | "photoProduct"
  | "reviewProduct"
  | "photoIngredients"
  | "reviewIngredients"
  | "productFound";

interface ProductDetails {
  brand: string;
  name: string;
  product_type: string;
  variant: string;
}

// ─── INGREDIENT CLEANING ─────────────────────────────────────────────────────

const BOTANICAL_MAP: Record<string, string> = {
  "butyrospermum parkii (shea) butter": "Butyrospermum Parkii Butter",
  "helianthus annuus (sunflower) seed oil": "Helianthus Annuus Seed Oil",
  "cocos nucifera (coconut) oil": "Cocos Nucifera Oil",
  "mentha piperita (peppermint) oil": "Mentha Piperita Oil",
  "theobroma cacao (cocoa) seed butter": "Theobroma Cacao Seed Butter",
  "copernicia cerifera (carnauba) wax": "Copernicia Cerifera Cera",
  "fragaria ananassa (strawberry) seed oil": "Fragaria Ananassa Seed Oil",
  "fragaria ananassa (strawberry) fruit extract": "Fragaria Ananassa Fruit Extract",
  "prunus armeniaca (apricot) kernel oil": "Prunus Armeniaca Kernel Oil",
  "ribes nigrum (black currant) seed oil": "Ribes Nigrum Seed Oil",
  "rosmarinus officinalis (rosemary) leaf extract": "Rosmarinus Officinalis Leaf Extract",
  "rosmarinus officinalis (rosemary) leaf oil": "Rosmarinus Officinalis Leaf Oil",
  "glycine soja (soybean) oil": "Glycine Soja Oil",
  "sambucus nigra (elder) flower extract": "Sambucus Nigra Flower Extract",
  "cucumis sativus (cucumber) fruit extract": "Cucumis Sativus Fruit Extract",
  "cucumis sativus (cucumber) fruit water": "Cucumis Sativus Fruit Water",
  "persea gratissima (avocado) oil": "Persea Gratissima Oil",
  "prunus amygdalus dulcis (sweet almond) oil": "Prunus Amygdalus Dulcis Oil",
  "prunus amygdalus dulcis (sweet almond) seed extract": "Prunus Amygdalus Dulcis Seed Extract",
  "lavandula angustifolia (lavender) oil": "Lavandula Angustifolia Oil",
  "chamomilla recutita (matricaria) flower extract": "Chamomilla Recutita Flower Extract",
  "chamomilla recutita (matricaria) flower/leaf extract": "Chamomilla Recutita Flower/Leaf Extract",
  "rosa damascena (damask rose) flower water": "Rosa Damascena Flower Water",
  "rubus villosus (blackberry) fruit extract": "Rubus Villosus Fruit Extract",
  "urtica dioica (nettle) leaf extract": "Urtica Dioica Leaf Extract",
  "illicium verum (anise) fruit/seed oil": "Illicium Verum Fruit/Seed Oil",
  "pelargonium graveolens (geranium) oil": "Pelargonium Graveolens Oil",
  "avena sativa (oat) kernel extract": "Avena Sativa Kernel Extract",
  "avena sativa (oat) leaf/stem extract": "Avena Sativa Leaf/Stem Extract",
  "juglans regia (walnut) shell powder": "Juglans Regia Shell Powder",
  "linum usitatissimum (linseed) seed extract": "Linum Usitatissimum Seed Extract",
  "mangifera indica (mango) seed butter": "Mangifera Indica Seed Butter",
  "oenothera biennis (evening primrose) extract": "Oenothera Biennis Extract",
  "triticum vulgare (wheat) starch": "Triticum Vulgare Starch",
  "triticum vulgare (wheat) germ oil": "Triticum Vulgare Germ Oil",
  "olea europaea (olive) fruit oil": "Olea Europaea Fruit Oil",
  "brassica campestris (rapeseed) seed oil": "Brassica Campestris Seed Oil",
  "hamamelis virginiana (witch hazel) leaf extract": "Hamamelis Virginiana Leaf Extract",
  "salix alba (willow) bark extract": "Salix Alba Bark Extract",
  "citrus aurantium bergamia (bergamot) peel oil": "Citrus Aurantium Bergamia Peel Oil",
  "citrus limon (lemon) peel oil": "Citrus Limon Peel Oil",
  "cedrus deodara (cedar) wood oil": "Cedrus Deodara Wood Oil",
  "citrus paradisi (grapefruit) peel oil": "Citrus Paradisi Peel Oil",
  "pyrus malus (apple) fruit extract": "Pyrus Malus Fruit Extract",
  "citrus nobilis (mandarin orange) oil": "Citrus Nobilis Oil",
  "simmondsia chinensis (jojoba) seed oil": "Simmondsia Chinensis Seed Oil",
  "citrus aurantium amara (bitter orange) leaf/twig oil": "Citrus Aurantium Amara Leaf/Twig Oil",
  "mentha viridis (spearmint) leaf oil": "Mentha Viridis Leaf Oil",
  "castanea crenata (chestnut) shell extract": "Castanea Crenata Shell Extract",
  "panthenol (vitamin b5)": "Panthenol",
  "tocopherol (vitamin e)": "Tocopherol",
  "glycine soja oil/soybean oil": "Glycine Soja Oil",
  "helianthus annuus seed oil/sunflower seed oil": "Helianthus Annuus Seed Oil",
  "cocos nucifera oil/coconut oil": "Cocos Nucifera Oil",
  "citrullus lanatus fruit extract/watermelon fruit extract": "Citrullus Lanatus Fruit Extract",
  "ricinus communis seed oil/castor seed oil": "Ricinus Communis Seed Oil",
  "theobroma cacao seed butter/cocoa seed butter": "Theobroma Cacao Seed Butter",
  "simmondsia chinensis seed oil/jojoba seed oil": "Simmondsia Chinensis Seed Oil",
  "musa paradisiaca fruit juice/banana fruit juice": "Musa Paradisiaca Fruit Juice",
  "carica papaya fruit extract/papaya fruit extract": "Carica Papaya Fruit Extract",
  "ananas sativus fruit extract/pineapple fruit extract": "Ananas Sativus Fruit Extract",
  "vitis vinifera seed oil/grape seed oil": "Vitis Vinifera Seed Oil",
  "vitis vinifera fruit water/grape fruit water": "Vitis Vinifera Fruit Water",
  "persea gratissima oil/avocado oil": "Persea Gratissima Oil",
  "rosmarinus officinalis leaf extract/rosemary leaf extract": "Rosmarinus Officinalis Leaf Extract",
  "copernicia cerifera cera/carnauba wax": "Copernicia Cerifera Cera",
  "acacia decurrens flower cera/acacia decurrens flower wax": "Acacia Decurrens Flower Cera",
  "helianthus annuus seed cera/sunflower seed wax": "Helianthus Annuus Seed Cera",
  "mel/honey": "Mel",
  "cera alba/beeswax": "Cera Alba",
  "aqua/water/eau": "Aqua",
  "aqua/water": "Aqua",
  "sea salt (maris sal)": "Maris Sal",
  "maris sal (sea salt)": "Maris Sal",
  "purified water": "Aqua",
  "soybean oil": "Glycine Soja Oil",
  "sunflower seed oil": "Helianthus Annuus Seed Oil",
  "liquid paraffin": "Paraffinum Liquidum",
  "paraffin wax": "Paraffin",
  "parffin": "Paraffin",
  "lavender fragrance": "Parfum",
  "stearellium-20": "Steareth-20",
  "caryone": "Carvone",
  "ci75810": "CI 75810",
  "linalool acetate": "Linalyl Acetate",
  "linelyl acetate": "Linalyl Acetate",
  "linolyl acetate": "Linalyl Acetate",
  "palmitoyl palmitoyl tripeptide-1": "Palmitoyl Tripeptide-1",
  "tetramethyl acetyloctahydronaphthalene": "Tetramethyl Acetyloctahydronaphthalenes",
  "tetramethyl acetyloctohydronaphthalenes": "Tetramethyl Acetyloctahydronaphthalenes",
  "trihyoroxystearin": "Trihydroxystearin",
  "distearoyethyl dimonium chloride": "Distearoylethyl Dimonium Chloride",
  "guar hydroxypropyl trimonium chloride": "Guar Hydroxypropyltrimonium Chloride",
  "cocamidea": "Cocamide",
  "coco-glukoside": "Coco-Glucoside",
  "pirocotone olamine": "Piroctone Olamine",
  "alpha-isomethyl lonone": "Alpha-Isomethyl Ionone",
  "ethylhexyl triazore": "Ethylhexyl Triazone",
  "glycaryl stearate": "Glyceryl Stearate",
  "alcohol denatured": "Alcohol Denat.",
  "ext. violet 2 (ci 60730)": "CI 60730",
  "disodium edta": "Disodium EDTA",
  "tetrasodium edta": "Tetrasodium EDTA",
  "tea-dodecylbenzenesulfonate": "TEA-Dodecylbenzenesulfonate",
  "cocamide mea": "Cocamide MEA",
  "cocamide dea": "Cocamide DEA",
  "peg-400": "PEG-400",
  "ppg-3 benzyl ether myristate": "PPG-3 Benzyl Ether Myristate",
  "ppg-1 trideceth-6": "PPG-1 Trideceth-6",
  "ppg-2 hydroxyethyl cocamide": "PPG-2 Hydroxyethyl Cocamide",
  "ppg-7 amodimethicone": "PPG-7 Amodimethicone",
  "ppg-5-ceteth-20": "PPG-5-Ceteth-20",
  "peg-7 amodimethicone": "PEG-7 Amodimethicone",
  "peg-150 pentaerythrityl tetrastearate": "PEG-150 Pentaerythrityl Tetrastearate",
  "peg-100 stearate": "PEG-100 Stearate",
  "peg-55 propylene glycol oleate": "PEG-55 Propylene Glycol Oleate",
  "peg-60 hydrogenated castor oil": "PEG-60 Hydrogenated Castor Oil",
  "peg-40 hydrogenated castor oil": "PEG-40 Hydrogenated Castor Oil",
  "peg-14m": "PEG-14M",
  "peg-120 methyl glucose dioleate": "PEG-120 Methyl Glucose Dioleate",
};

const AQUA_VARIANTS = new Set([
  "aqua (water)", "aqua / water", "aqua/water/eau", "aqua/water",
  "water (aqua)", "water(aqua)", "water / aqua", "water", "purified water",
]);

const cleanIngredients = (rawText: string): string => {
  let text = rawText;
  text = text.replace(/1,2-Hexanediol/gi, "HEXANEDIOL_PLACEHOLDER");
  text = text.replace(/Hydroxypropyl Guar, Hydroxypropyltrimonium Chloride/gi, "HYDROXYPROPYL_GUAR_PLACEHOLDER");

  const cleaned = text.split(",").map((raw) => {
    let s = raw.trim(); // Rule 1

    s = s.replace(/\s*[*†+‡]+$/, "").trim(); // Rule 1B

    if (/ \/ /.test(s) && !/^(parfum|fragrance)/i.test(s)) { // Rule 1C
      s = s.split(" / ")[0].trim();
    }

    const botanical = BOTANICAL_MAP[s.toLowerCase()]; // Rule 9
    if (botanical !== undefined) s = botanical;

    if (AQUA_VARIANTS.has(s.toLowerCase())) s = "Aqua"; // Rule 2

    if (/^(parfum|fragrance)/i.test(s)) s = "Parfum"; // Rule 3

    // Rule 4: F.I.L and EU batch codes
    s = s
      .replace(/\(F\.I\.L[^)]*\)/gi, "")
      .replace(/\(F\.IL[^)]*\)/gi, "")
      .replace(/\(F\.I\.I[^)]*\)/gi, "")
      .replace(/\(FIL[^)]*\)/gi, "")
      .replace(/\(EU[A-Za-z0-9][^)]*\)/gi, "")
      .trim();

    // Rule 5: concentration notes like (200ppb), (10ppm)
    s = s.replace(/\(\d+(?:\.\d+)?(?:ppb|ppm|%)[^)]*\)/gi, "").trim();

    // Rule 6: square bracket content, unless it contains "unclear"
    s = s.replace(/\[[^\]]*\]/g, (m) => (/unclear/i.test(m) ? m : "")).trim();

    // Rule 7: CI colour codes
    s = s.replace(/^[^(]+\(CI\s*(\d+)\)\s*$/i, "CI $1"); // "Blue 1 (CI 42090)" → "CI 42090"
    s = s.replace(/^(CI\s*\d+)\s*\([^)]+\)\s*$/i, "$1"); // "CI 17200 (Red No. 33)" → "CI 17200"
    s = s.replace(/\bCI(\d+)/gi, "CI $1"); // "CI77891" → "CI 77891"

    // Rule 10: remove final parenthetical if it shares >50% words with the main name
    s = s.replace(/^(.*?)\s*\(([^)]+)\)\s*$/, (match, main, parens) => {
      const mWords = main.toLowerCase().split(/\s+/).filter(Boolean);
      const pWords = parens.toLowerCase().split(/\s+/).filter(Boolean);
      if (!mWords.length || !pWords.length) return match;
      const overlap = pWords.filter((w: string) => mWords.includes(w)).length;
      return overlap / pWords.length > 0.5 ? main.trim() : match;
    });

    // Rule 11: vinegar standardisation
    s = s.replace(/vinegar\s*\(acetum\)/gi, "Acetum");
    s = s.replace(/vinegar\/acetum\/vinaigre/gi, "Acetum");

    return s.trim();
  });

  return cleaned
    .map((s) =>
      s
        .replace(/HEXANEDIOL_PLACEHOLDER/g, "1,2-Hexanediol")
        .replace(/HYDROXYPROPYL_GUAR_PLACEHOLDER/g, "Hydroxypropyl Guar Hydroxypropyltrimonium Chloride")
    )
    .filter((s) => s.length > 0)
    .join(", ");
};

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function HomeScreen() {

  // ─── STATE ─────────────────────────────────────────────────────────────────

  const [permission, requestPermission] = useCameraPermissions();
  const [screen, setScreen] = useState<Screen>("name");
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [productFound, setProductFound] = useState<any>(null);
  const [scannedBy, setScannedBy] = useState("");
  const [nameInput, setNameInput] = useState("");

  const [productPhoto, setProductPhoto] = useState<string | null>(null);
  const [productPhotoBase64, setProductPhotoBase64] = useState<string | null>(null);

  const [brand, setBrand] = useState("");
  const [productName, setProductName] = useState("");
  const [productType, setProductType] = useState("");
  const [variant, setVariant] = useState("");

  const [ingredientPhoto, setIngredientPhoto] = useState<string | null>(null);
  const [ingredientPhotoBase64, setIngredientPhotoBase64] = useState<string | null>(null);
  const [ingredientPhoto2, setIngredientPhoto2] = useState<string | null>(null);
  const [ingredientPhotoBase64_2, setIngredientPhotoBase64_2] = useState<string | null>(null);

  const [parsedIngredients, setParsedIngredients] = useState<string[]>([]);

  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const lastScan = useRef<{ barcode: string; time: number } | null>(null);
  // Prevents concurrent barcode processing — ref (not state) so it's synchronously reliable
  const isProcessing = useRef(false);

  const [manualBarcodeVisible, setManualBarcodeVisible] = useState(false);
  const [manualBarcodeInput, setManualBarcodeInput] = useState("");
  const [manualBarcodeSearching, setManualBarcodeSearching] = useState(false);

  const [countToday, setCountToday] = useState(0);
  const [countTotal, setCountTotal] = useState(0);

  // ─── COUNTS ────────────────────────────────────────────────────────────────

  const fetchCounts = async (name: string) => {
    if (!name) return;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [{ count: todayCount }, { count: totalCount }] = await Promise.all([
      supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("scanned_by", name)
        .gte("created_at", startOfDay.toISOString()),
      supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("scanned_by", name),
    ]);
    setCountToday(todayCount ?? 0);
    setCountTotal(totalCount ?? 0);
  };

  useEffect(() => {
    if (scannedBy) fetchCounts(scannedBy);
  }, [scannedBy]);

  // ─── HELPERS ───────────────────────────────────────────────────────────────

  const normalizeIngredient = (name: string): string => {
    if (name === "[unclear]") return "[unclear]";
    return name
      // Title case each run of letters: first letter upper, rest lower
      .replace(/[a-zA-Z]+/g, (word) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      // Restore CI colorant codes (e.g. "Ci 17200" → "CI 17200")
      .replace(/\bCi(?=\s+\d)/g, "CI")
      // Restore [unclear] to lowercase in case it appeared mid-ingredient
      .replace(/\[Unclear\]/g, "[unclear]");
  };

  const compressForGPT = async (uri: string): Promise<string> => {
    const imageRef = await ImageManipulator.manipulate(uri)
      .resize({ width: 1024 })
      .renderAsync();
    const result = await imageRef.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
    return result.base64 ?? "";
  };

  const uploadPhotoBase64 = async (
    base64: string,
    bucket: string,
    filename: string
  ): Promise<string | null> => {
    try {
      console.log(`[upload] starting upload to ${bucket} as ${filename}`);

      // Remove data URI prefix if present
      const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");

      // Supabase's own docs state: in React Native, Blob/FormData/Buffer do not work as upload
      // bodies — only a real ArrayBuffer does. decode() returns a native ArrayBuffer.
      const arrayBuffer = decode(base64Data);

      const { error } = await supabase.storage
        .from(bucket)
        .upload(filename, arrayBuffer, { contentType: "image/jpeg", upsert: true });

      if (error) {
        console.log(`[upload] ${bucket} failed:`, error.message);
        return null;
      }

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filename);
      console.log(`[upload] ${bucket} success:`, urlData.publicUrl);
      return urlData.publicUrl;
    } catch (e) {
      console.log(`[upload] ${bucket} exception:`, e);
      return null;
    }
  };

  const analyseProductPhotoWithClaude = async (base64Image: string): Promise<ProductDetails> => {
    const prompt = 'This is a photo of the front of a cosmetic product. Extract only what is clearly visible on the packaging and return a JSON object with exactly these fields: "brand" (the manufacturer or brand name), "name" (the product name, excluding brand), "product_type" (category such as shampoo, conditioner, shower gel, body wash, toothpaste, deodorant, sunscreen, serum, moisturiser, mascara, foundation, lip gloss, face wash — one to three words), "variant" (colour, shade, flavour, scent, or edition — empty string if none). Do not guess or infer anything that is not visible. If a field is unclear or not shown, return an empty string for that field. Return ONLY the JSON object, no explanation or other text. Example: {"brand": "L\'Oreal", "name": "Elvive", "product_type": "shampoo", "variant": "Coconut"}';

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Image } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);

    const json = await response.json();
    const text: string = json.content?.[0]?.text?.trim() ?? "{}";
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      brand: parsed.brand ?? "",
      name: parsed.name ?? "",
      product_type: parsed.product_type ?? "",
      variant: parsed.variant ?? "",
    };
  };

  const analyseIngredientsWithClaude = async (base64Image1: string, base64Image2?: string): Promise<string[]> => {
    const singlePrompt = "This image shows the back of a cosmetic product with an ingredients list. Transcribe the ingredients list EXACTLY as written, character for character. Ingredients may be separated by commas, dots, middle dots (·), semicolons, or bullet points - treat all of these as separators between ingredients. Do not add, remove, invent, or substitute any ingredients. Do not use common 'typical' ingredient lists from memory - only transcribe what is visibly written in THIS image. If a word is genuinely illegible, write [unclear] for that word only. Be aware that some INCI ingredient names contain commas as part of the chemical name itself, not as separators - for example '1,2-Hexanediol', '1,3-Propanediol', '2,3-Butanediol'. These numeric prefixes with commas are part of a single ingredient name and must NOT be split into separate items. Use your knowledge of cosmetic chemistry to recognise these patterns and keep them as one ingredient. Return ONLY a comma-separated list of ingredients in the exact order they appear, with no other text or commentary.";
    const multiPrompt = singlePrompt + " These two images may show ingredients lists that continue from one to the other - combine them into a single ordered list.";

    const content: object[] = [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Image1 } },
      ...(base64Image2
        ? [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Image2 } }]
        : []),
      { type: "text", text: base64Image2 ? multiPrompt : singlePrompt },
    ];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);

    const json = await response.json();
    const text: string = json.content?.[0]?.text?.trim() ?? "";
    return text
      .split(",")
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0)
      .map(normalizeIngredient);
  };

  // ─── HANDLERS ──────────────────────────────────────────────────────────────

  const handleScanAgain = () => {
    setScreen("scanner");
    setScannedBarcode(null);
    setProductFound(null);
    setProductPhoto(null);
    setProductPhotoBase64(null);
    setBrand("");
    setProductName("");
    setProductType("");
    setVariant("");
    setIngredientPhoto(null);
    setIngredientPhotoBase64(null);
    setIngredientPhoto2(null);
    setIngredientPhotoBase64_2(null);
    setParsedIngredients([]);
    lastScan.current = null;
    isProcessing.current = false;
  };

  // Saves the product, both photos, and ingredient list; then triggers background INCI conversion.
  const handleConfirmSave = async (qcStatus: "pending" | "flagged") => {
    // Guard: scannedBarcode should always be set at this point in the flow
    if (!scannedBarcode) {
      Alert.alert("Error", "No barcode found — please scan again.");
      return;
    }

    setSaving(true);

    try {
      const sanitize = (s: string) =>
        s.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      const nameParts = [brand, productName, variant]
        .map(s => s.trim())
        .filter(Boolean)
        .map(sanitize);
      const baseFilename = `${nameParts.join("_")}_${Date.now()}`;

      // Upload all photos in parallel — falls back to null if any fail
      const [productPhotoUrl, ingredientPhotoUrl, ingredientPhotoUrl2] = await Promise.all([
        productPhotoBase64 ? uploadPhotoBase64(productPhotoBase64, "product-photo", `${baseFilename}.jpg`) : Promise.resolve(null),
        ingredientPhotoBase64 ? uploadPhotoBase64(ingredientPhotoBase64, "ingredients-photo", `${baseFilename}_ingredients1.jpg`) : Promise.resolve(null),
        ingredientPhotoBase64_2 ? uploadPhotoBase64(ingredientPhotoBase64_2, "ingredients-photo", `${baseFilename}_ingredients2.jpg`) : Promise.resolve(null),
      ]);
      setProductPhotoBase64("");
      setIngredientPhotoBase64("");
      setIngredientPhotoBase64_2("");

      // -- Run in Supabase: ALTER TABLE products ADD COLUMN ingredient_image_url text;
      // -- Run in Supabase: ALTER TABLE products ADD COLUMN ingredient_image_url_2 text;
      // -- Run in Supabase: DROP VIEW products_with_ingredients; recreate with ingredient_image_url, ingredient_image_url_2 included

      const rawText = parsedIngredients.join(", ");
      const cleanedText = cleanIngredients(rawText);
      const computedQcStatus = rawText.includes("[unclear]") ? "flagged_for_laptop" : "pending";

      // Insert the product record
      const { data: newProduct, error: productError } = await supabase
        .from("products")
        .insert([{
          barcode: scannedBarcode,
          brand: brand.trim(),
          name: productName.trim(),
          product_type: productType.trim(),
          variant: variant.trim() || null,
          qc_status: computedQcStatus,
          scanned_by: scannedBy,
          product_image_url: productPhotoUrl,
          ingredient_image_url: ingredientPhotoUrl,
          ingredient_image_url_2: ingredientPhotoUrl2,
          ingredients_ocr_raw: rawText,
          ingredients_ocr_raw_created_at: new Date().toISOString(),
          ingredients_cleaned: cleanedText,
          ingredients_cleaned_at: new Date().toISOString(),
          ingredients_verified: cleanedText,
          ingredients_verified_at: new Date().toISOString(),
        }])
        .select()
        .single();

      if (productError) {
        Alert.alert("Error saving product", productError.message);
        return; // finally block will still run and reset saving state
      }

      const newProductId = newProduct.id;

      // Link the scan record to the new product and store the ingredient photo URL
      const { error: scanUpdateError } = await supabase
        .from("scans")
        .update({ product_id: newProductId, image_url: ingredientPhotoUrl })
        .eq("barcode", scannedBarcode);
      if (scanUpdateError) console.warn("[save] Failed to update scan record:", scanUpdateError.message);

      // Insert ingredients from cleaned text
      const cleanedIngredients = cleanedText.split(", ").filter((s: string) => s.length > 0);
      if (cleanedIngredients.length > 0) {
        await supabase.from("product_ingredients").delete().eq("product_id", newProductId);

        const rows = cleanedIngredients.map((text: string, index: number) => ({
          product_id: newProductId,
          barcode: scannedBarcode,
          ingredient_name: text,
          raw_text: text,
          position: index + 1,
          brand: brand.trim(),
          product_name: productName.trim(),
          variant: variant.trim() || null,
        })).sort((a, b) => a.position - b.position);

        const { error: ingredientsError } = await supabase
          .from("product_ingredients")
          .insert(rows)
          .select()
          .order("position");

        if (ingredientsError) {
          console.warn("[save] Failed to save ingredients:", ingredientsError.message);
          // Roll back the product insert to avoid an orphaned record with no ingredients
          await supabase.from("products").delete().eq("id", newProductId);
          Alert.alert("Save failed", "Could not save the ingredient list. Please try again — your photos and ingredients have been kept.");
          return; // finally resets saving state; all state is preserved so the user can retry
        }
      }

      handleScanAgain();
      fetchCounts(scannedBy);
      Alert.alert(
        qcStatus === "flagged" ? "Flagged for review — thank you!" : "All saved! ✅",
        "Thank you for building the database!",
        [{ text: "Scan Another", style: "default" }]
      );
    } catch (e) {
      // Network-level failure or unexpected error — inform the user and allow a retry
      Alert.alert("Connection error", "Could not save the product. Please check your internet connection and try again.");
      console.warn("[save] handleConfirmSave threw:", e);
    } finally {
      // Always reset the saving state, even if an early return or error occurred
      setSaving(false);
    }
  };

  // Async DB work for a confirmed barcode — called by handleBarcodeScan below.
  const processBarcodeScan = async (data: string) => {
    try {
      // Check if this barcode already exists in the database.
      // maybeSingle returns { data: null, error: null } when no rows match, so we can
      // distinguish "not found" (expected) from an actual DB/network error.
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("*")
        .eq("barcode", data)
        .maybeSingle();

      if (productError) {
        Alert.alert("Connection error", "Could not check this product. Please check your internet connection and try again.");
        lastScan.current = null;
        setScannedBarcode(null);
        return;
      }

      if (product) {
        setProductFound(product);
        setScreen("productFound");
      } else {
        // Only insert a scan record for new products — the row is linked to the product in handleConfirmSave
        const { error: scanError } = await supabase.from("scans").insert([{ barcode: data }]);
        if (scanError) console.warn("[scan] Failed to insert scan record:", scanError.message);
        setProductFound(null);
        setScreen("photoProduct");
      }
    } catch (e) {
      // Network-level failure (e.g. fetch threw before reaching Supabase)
      Alert.alert("Connection error", "Could not connect to the database. Please check your internet connection.");
      lastScan.current = null;
      setScannedBarcode(null);
    } finally {
      isProcessing.current = false;
    }
  };

  // Synchronous handler passed to CameraView's onBarcodeScanned.
  // MUST NOT be async — in production EAS builds (Hermes engine), passing an async function to
  // a native callback causes silent failures because Hermes receives an unexpected Promise return
  // value from the native event. The async DB work is delegated to processBarcodeScan instead.
  const handleBarcodeScan = ({ data }: { data: string }) => {
    const now = Date.now();
    if (lastScan.current?.barcode === data && now - lastScan.current.time < 3000) return;
    if (isProcessing.current) return;

    lastScan.current = { barcode: data, time: now };
    isProcessing.current = true;
    setScannedBarcode(data);

    Vibration.vibrate(100);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    // Fire and forget — errors are handled inside processBarcodeScan
    processBarcodeScan(data);
  };

  // ─── MANUAL BARCODE ENTRY ──────────────────────────────────────────────────

  const handleManualBarcodeSearch = async () => {
    const trimmed = manualBarcodeInput.trim();
    if (!trimmed) return;
    setManualBarcodeSearching(true);
    setScannedBarcode(trimmed);
    isProcessing.current = true;
    await processBarcodeScan(trimmed);
    setManualBarcodeSearching(false);
    setManualBarcodeVisible(false);
    setManualBarcodeInput("");
  };

  // ─── SCREENS ───────────────────────────────────────────────────────────────

  // Name entry
  if (screen === "name") {
    return (
      <View style={styles.nameContainer}>
        <Text style={styles.nameTitle}>👋 Welcome!</Text>
        <Text style={styles.nameSubtitle}>
          Enter your name so we know who's building the database!
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Your name"
          value={nameInput}
          onChangeText={setNameInput}
          autoFocus
        />
        <TouchableOpacity
          style={styles.saveButton}
          onPress={() => {
            if (!nameInput.trim()) { Alert.alert("Please enter your name"); return; }
            setScannedBy(nameInput.trim());
            setScreen("scanner");
          }}
        >
          <Text style={styles.saveButtonText}>Start Scanning →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Camera permission gate
  if (!permission) return <Text>Loading...</Text>;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: "center", margin: 20 }}>
          We need camera permission to scan barcodes
        </Text>
        <Button title="Allow Camera" onPress={() => requestPermission()} />
      </View>
    );
  }

  // Product already in database
  if (screen === "productFound") {
    return (
      <View style={styles.resultContainer}>
        <Text style={styles.foundTitle}>✅ Product Found!</Text>
        <Text style={styles.foundBrand}>{productFound.brand}</Text>
        <Text style={styles.foundName}>{productFound.name}</Text>
        {productFound.variant && <Text style={styles.foundVariant}>{productFound.variant}</Text>}

        <TouchableOpacity style={styles.scanAgainButton} onPress={handleScanAgain}>
          <Text style={styles.scanAgainText}>Scan Another Product</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Step 1 — photograph product front
  if (screen === "photoProduct") {
    const handleTakeProductPhoto = async () => {
      try {
        const result = await ImagePicker.launchCameraAsync({
          quality: 0.8,
          allowsEditing: false,
          mediaTypes: ["images"],
          base64: true,
        });
        if (!result.canceled && result.assets[0]) {
          setProductPhoto(result.assets[0].uri);
          setProductPhotoBase64(result.assets[0].base64 ?? null);
        }
      } catch {
        Alert.alert("Error opening camera", "Please try again");
      }
    };

    const handleAnalyseProductPhoto = async () => {
      if (!productPhoto) return;
      setParsing(true);
      try {
        const compressed = await compressForGPT(productPhoto);
        const details = await analyseProductPhotoWithClaude(compressed);
        setBrand(details.brand);
        setProductName(details.name);
        setProductType(details.product_type);
        setVariant(details.variant);
        setScreen("reviewProduct");
      } catch {
        Alert.alert("Could not analyse photo", "Please try again or check your connection.");
      } finally {
        setParsing(false);
      }
    };

    return (
      <View style={styles.formContainer}>
        <Text style={styles.formTitle}>📷 Photograph Product</Text>
        <Text style={styles.stepText}>Step 1 of 3 — Front of product</Text>
        <Text style={styles.formSubtitle}>
          Take a clear photo of the front label so AI can read the brand and product name.
        </Text>

        {productPhoto ? (
          <View style={styles.photoContainer}>
            <Image source={{ uri: productPhoto }} style={styles.photoPreview} resizeMode="cover" />
            {parsing ? (
              <View style={styles.parsingContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.parsingText}>Analysing with AI...</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity style={styles.retakeButton} onPress={handleTakeProductPhoto}>
                  <Text style={styles.retakeText}>Retake Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleAnalyseProductPhoto}>
                  <Text style={styles.saveButtonText}>Analyse with AI →</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <TouchableOpacity style={styles.photoButton} onPress={handleTakeProductPhoto}>
            <Text style={styles.photoButtonText}>📷 Take Photo of Product</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.cancelButton} onPress={handleScanAgain}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Step 2 — review and edit extracted product details
  if (screen === "reviewProduct") {
    return (
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.formTitle}>✏️ Review Details</Text>
        <Text style={styles.stepText}>Step 2 of 3 — Correct any mistakes</Text>

        {productPhoto && (
          <Image source={{ uri: productPhoto }} style={styles.thumbPreview} resizeMode="cover" />
        )}

        <Text style={styles.label}>Brand *</Text>
        <TextInput style={styles.input} value={brand} onChangeText={setBrand} placeholder="e.g. L'Oreal" />

        <Text style={styles.label}>Product Name *</Text>
        <TextInput style={styles.input} value={productName} onChangeText={setProductName} placeholder="e.g. Elvive" />

        <Text style={styles.label}>Product Type *</Text>
        <TextInput style={styles.input} value={productType} onChangeText={setProductType} placeholder="e.g. shampoo, serum, mascara" />

        <Text style={styles.label}>Variant / Shade / Scent (optional)</Text>
        <TextInput style={styles.input} value={variant} onChangeText={setVariant} placeholder="e.g. Coconut, Blonde, Original" />

        <TouchableOpacity
          style={[styles.saveButton, (!brand.trim() || !productName.trim() || !productType.trim()) && styles.buttonDisabled]}
          onPress={() => {
            if (!brand.trim() || !productName.trim() || !productType.trim()) {
              Alert.alert("Please fill in brand, name and product type");
              return;
            }
            setScreen("photoIngredients");
          }}
        >
          <Text style={styles.saveButtonText}>Confirm → Photograph Ingredients</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={() => setScreen("photoProduct")}>
          <Text style={styles.cancelText}>← Retake Product Photo</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Step 3 — photograph ingredients label (supports up to 2 photos)
  if (screen === "photoIngredients") {
    const handleTakeIngredientPhoto = async () => {
      try {
        const result = await ImagePicker.launchCameraAsync({
          quality: 0.8,
          allowsEditing: false,
          mediaTypes: ["images"],
          base64: true,
        });
        if (!result.canceled && result.assets[0]) {
          setIngredientPhoto(result.assets[0].uri);
          setIngredientPhotoBase64(result.assets[0].base64 ?? null);
          setIngredientPhoto2(null);
          setIngredientPhotoBase64_2(null);
        }
      } catch {
        Alert.alert("Error opening camera", "Please try again");
      }
    };

    const handleTakeIngredientPhoto2 = async () => {
      try {
        const result = await ImagePicker.launchCameraAsync({
          quality: 0.8,
          allowsEditing: false,
          mediaTypes: ["images"],
          base64: true,
        });
        if (!result.canceled && result.assets[0]) {
          setIngredientPhoto2(result.assets[0].uri);
          setIngredientPhotoBase64_2(result.assets[0].base64 ?? null);
        }
      } catch {
        Alert.alert("Error opening camera", "Please try again");
      }
    };

    const handleAnalyseIngredients = async () => {
      if (!ingredientPhoto) return;
      setParsing(true);
      try {
        const [compressed1, compressed2] = await Promise.all([
          compressForGPT(ingredientPhoto),
          ingredientPhoto2 ? compressForGPT(ingredientPhoto2) : Promise.resolve(undefined as string | undefined),
        ]);
        const ingredients = await analyseIngredientsWithClaude(compressed1, compressed2);
        setParsedIngredients(ingredients);
        setScreen("reviewIngredients");
      } catch {
        Alert.alert("Could not analyse photo", "Please try again or check your connection.");
      } finally {
        setParsing(false);
      }
    };

    if (!ingredientPhoto) {
      return (
        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>📸 Photograph Ingredients</Text>
          <Text style={styles.stepText}>Step 3 of 3 — Ingredients list</Text>
          <Text style={styles.formSubtitle}>
            Take a clear photo of the full ingredients list. Make sure all text is visible and in focus.
          </Text>
          <TouchableOpacity style={styles.photoButton} onPress={handleTakeIngredientPhoto}>
            <Text style={styles.photoButtonText}>📷 Take Photo of Ingredients</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setScreen("reviewProduct")}>
            <Text style={styles.cancelText}>← Back to Review</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.ingredientPhotoScreenContent}>
        <Text style={styles.formTitle}>📸 Photograph Ingredients</Text>
        <Text style={styles.stepText}>Step 3 of 3 — Ingredients list</Text>
        <Image source={{ uri: ingredientPhoto }} style={styles.photoPreview} resizeMode="cover" />
        {ingredientPhoto2 && (
          <Image source={{ uri: ingredientPhoto2 }} style={[styles.photoPreview, { marginTop: 8 }]} resizeMode="cover" />
        )}
        {parsing ? (
          <View style={styles.parsingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.parsingText}>Analysing ingredients with AI...</Text>
          </View>
        ) : (
          <>
            {!ingredientPhoto2 && (
              <TouchableOpacity style={styles.addPhotoButton} onPress={handleTakeIngredientPhoto2}>
                <Text style={styles.addPhotoButtonText}>📸 Add Another Photo</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.saveButton, { marginTop: 12 }]} onPress={handleAnalyseIngredients}>
              <Text style={styles.saveButtonText}>✅ Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setScreen("reviewProduct")}>
              <Text style={styles.cancelText}>← Back to Review</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    );
  }

  // Step 4 — read-only ingredient review before saving
  if (screen === "reviewIngredients") {
    const count = parsedIngredients.length;
    const tooFew = count < 3;
    const tooMany = count > 60;

    const handleRetake = () => {
      setIngredientPhoto(null);
      setIngredientPhotoBase64(null);
      setIngredientPhoto2(null);
      setIngredientPhotoBase64_2(null);
      setParsedIngredients([]);
      setScreen("photoIngredients");
    };

    return (
      <View style={styles.reviewKAV}>
        <ScrollView
          style={styles.reviewScroll}
          contentContainerStyle={styles.reviewScrollContent}
        >
          <Text style={styles.formTitle}>🧴 Review Ingredients</Text>
          <Text style={styles.stepText}>Step 3 of 3 — Confirm ingredient list</Text>

          <Text style={styles.ingredientCount}>{count} ingredients found</Text>

          {tooFew && (
            <Text style={styles.ingredientWarning}>
              ⚠️ Very few ingredients found — please retake the photo
            </Text>
          )}
          {tooMany && (
            <Text style={styles.ingredientWarning}>
              ⚠️ Unusually high number — please check the photo
            </Text>
          )}

          <Text style={styles.formSubtitle}>
            Check these match your product label. Flag for QC if anything looks off.
          </Text>

          <View style={styles.ingredientList}>
            {parsedIngredients.map((ingredient, index) => (
              <View key={index} style={styles.readOnlyIngredientRow}>
                <Text style={styles.readOnlyIngredientNumber}>{index + 1}.</Text>
                <Text style={styles.readOnlyIngredientText}>{ingredient}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={styles.reviewFooter}>
          {saving ? (
            <View style={styles.parsingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.parsingText}>Uploading & saving...</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity style={styles.retakeIngredientButton} onPress={handleRetake}>
                <Text style={styles.retakeIngredientText}>📸 Retake Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.flagButton} onPress={() => handleConfirmSave("flagged")}>
                <Text style={styles.flagButtonText}>⚠️ Flag for QC</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveButton, { marginTop: 10 }]} onPress={() => handleConfirmSave("pending")}>
                <Text style={styles.saveButtonText}>✅ Save</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  // Barcode scanner (default screen after name entry)
  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        onBarcodeScanned={handleBarcodeScan}
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
        }}
      />
      <View style={styles.overlay}>
        <View style={styles.topOverlay}>
          <Text style={styles.scannerBanner}>
            👤 {scannedBy}{"  |  "}Today: {countToday}{"  |  "}Total: {countTotal}
          </Text>
        </View>
        <View style={styles.middleRow}>
          <View style={styles.sideOverlay} />
          <View style={[styles.targetBox, flash && styles.targetBoxFlash]}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
          <View style={styles.sideOverlay} />
        </View>
        <View style={styles.bottomOverlay}>
          <Text style={styles.instructionText}>Position barcode inside the box</Text>
          <Text style={styles.instructionSubText}>
            Hold steady — curved bottles may need extra time
          </Text>
          <TouchableOpacity
            style={styles.manualEntryButton}
            onPress={() => setManualBarcodeVisible(true)}
          >
            <Text style={styles.manualEntryText}>Can't scan barcode? Enter manually</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={manualBarcodeVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setManualBarcodeVisible(false); setManualBarcodeInput(""); }}
      >
        <View style={styles.manualBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            onPress={() => { setManualBarcodeVisible(false); setManualBarcodeInput(""); }}
          />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <View style={styles.manualSheet}>
              <Text style={styles.manualSheetTitle}>Enter Barcode Number</Text>
              <TextInput
                style={styles.manualSheetInput}
                value={manualBarcodeInput}
                onChangeText={setManualBarcodeInput}
                keyboardType="number-pad"
                placeholder="e.g. 5000157024671"
                placeholderTextColor="#bbb"
                autoFocus
                returnKeyType="search"
                onSubmitEditing={handleManualBarcodeSearch}
              />
              {manualBarcodeSearching ? (
                <View style={styles.manualSheetLoading}>
                  <ActivityIndicator color="#007AFF" />
                  <Text style={styles.manualSheetLoadingText}>Searching...</Text>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.manualSheetSearchButton}
                    onPress={handleManualBarcodeSearch}
                  >
                    <Text style={styles.manualSheetSearchText}>Search</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.manualSheetCancelButton}
                    onPress={() => { setManualBarcodeVisible(false); setManualBarcodeInput(""); }}
                  >
                    <Text style={styles.manualSheetCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Scanner screen
  container: { flex: 1, backgroundColor: "black" },
  camera: { flex: 1 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "column" },
  topOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "flex-end", paddingBottom: 10 },
  scannerBanner: { color: "white", fontSize: 13, opacity: 0.75, textAlign: "center" },
  middleRow: { flexDirection: "row", height: 200 },
  sideOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  targetBox: { width: 280, height: 200, borderColor: "transparent", borderWidth: 2 },
  targetBoxFlash: { backgroundColor: "rgba(255,255,255,0.3)" },
  corner: { position: "absolute", width: 20, height: 20, borderColor: "white", borderWidth: 3 },
  topLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  topRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  bottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  bottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  bottomOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 20 },
  instructionText: { color: "white", fontSize: 16, textAlign: "center", marginBottom: 8 },
  instructionSubText: { color: "rgba(255,255,255,0.6)", fontSize: 13, textAlign: "center" },

  // Product found screen
  resultContainer: { flex: 1, padding: 30, justifyContent: "center", alignItems: "center", backgroundColor: "white" },
  foundTitle: { fontSize: 24, fontWeight: "bold", marginBottom: 20, color: "green" },
  foundBrand: { fontSize: 16, color: "#666", marginBottom: 5 },
  foundName: { fontSize: 22, fontWeight: "bold", marginBottom: 5, textAlign: "center" },
  foundVariant: { fontSize: 16, color: "#888", marginBottom: 10 },
  foundStatus: { fontSize: 14, color: "#aaa", marginBottom: 30 },
  scanAgainButton: { backgroundColor: "#007AFF", padding: 15, borderRadius: 10, width: "100%", alignItems: "center" },
  scanAgainText: { color: "white", fontSize: 16, fontWeight: "bold" },

  // Shared form layouts
  formContainer: { flex: 1, padding: 25, backgroundColor: "white", justifyContent: "center" },
  scrollContainer: { padding: 25, backgroundColor: "white", paddingTop: 60, paddingBottom: 40 },
  formTitle: { fontSize: 22, fontWeight: "bold", marginBottom: 5, color: "#333" },
  formSubtitle: { fontSize: 14, color: "#888", marginBottom: 10, lineHeight: 20 },
  stepText: { fontSize: 13, color: "#007AFF", fontWeight: "600", marginBottom: 12, marginTop: 4 },
  label: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 5, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: "#f9f9f9" },
  saveButton: { backgroundColor: "#007AFF", padding: 15, borderRadius: 10, alignItems: "center", marginTop: 25 },
  saveButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },
  buttonDisabled: { opacity: 0.4 },
  cancelButton: { padding: 15, alignItems: "center", marginTop: 10 },
  cancelText: { color: "#888", fontSize: 16 },

  // Name screen
  nameContainer: { flex: 1, padding: 30, justifyContent: "center", backgroundColor: "white" },
  nameTitle: { fontSize: 32, fontWeight: "bold", marginBottom: 15, textAlign: "center" },
  nameSubtitle: { fontSize: 16, color: "#666", marginBottom: 30, textAlign: "center", lineHeight: 24 },

  // Photo steps
  photoButton: { backgroundColor: "#34C759", padding: 20, borderRadius: 10, alignItems: "center", marginTop: 20, marginBottom: 10 },
  photoButtonText: { color: "white", fontSize: 18, fontWeight: "bold" },
  photoContainer: { marginTop: 15, alignItems: "center", width: "100%" },
  photoPreview: { width: "100%", height: 200, borderRadius: 10, marginBottom: 15 },
  ingredientPhotoScreenContent: { padding: 25, paddingTop: 60, paddingBottom: 40, backgroundColor: "white" },
  addPhotoButton: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#007AFF", borderRadius: 10, padding: 15, alignItems: "center", marginTop: 10 },
  addPhotoButtonText: { color: "#007AFF", fontSize: 16, fontWeight: "600" },
  thumbPreview: { width: "100%", height: 120, borderRadius: 10, marginBottom: 5, marginTop: 8 },
  retakeButton: { padding: 10, marginBottom: 5 },
  retakeText: { color: "#007AFF", fontSize: 16 },
  parsingContainer: { alignItems: "center", paddingVertical: 20 },
  parsingText: { marginTop: 12, fontSize: 15, color: "#555" },

  // Review ingredients screen
  reviewKAV: { flex: 1, backgroundColor: "white" },
  reviewScroll: { flex: 1 },
  reviewScrollContent: { padding: 25, paddingTop: 60, paddingBottom: 16 },
  reviewFooter: { backgroundColor: "white", paddingHorizontal: 25, paddingBottom: 30, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#f0f0f0" },
  ingredientCount: { fontSize: 18, fontWeight: "700", color: "#333", marginTop: 12, marginBottom: 8 },
  ingredientWarning: { fontSize: 14, color: "#c0392b", backgroundColor: "#fdecea", borderRadius: 8, padding: 10, marginBottom: 16, lineHeight: 20 },
  ingredientList: { marginBottom: 12 },
  readOnlyIngredientRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  readOnlyIngredientNumber: { fontSize: 13, color: "#999", width: 28, flexShrink: 0, marginTop: 1 },
  readOnlyIngredientText: { flex: 1, fontSize: 14, color: "#333", lineHeight: 20 },
  flagButton: { backgroundColor: "#fff9e6", borderWidth: 1, borderColor: "#f39c12", borderRadius: 10, paddingVertical: 15, alignItems: "center", marginTop: 10 },
  flagButtonText: { color: "#e67e22", fontSize: 16, fontWeight: "700" },
  retakeIngredientButton: { padding: 15, alignItems: "center", marginTop: 8, borderWidth: 1, borderColor: "#007AFF", borderRadius: 10 },
  retakeIngredientText: { color: "#007AFF", fontSize: 16, fontWeight: "600" },

  // Manual barcode entry
  manualEntryButton: { marginTop: 20, paddingVertical: 8, paddingHorizontal: 16 },
  manualEntryText: { color: "rgba(255,255,255,0.7)", fontSize: 14, textDecorationLine: "underline", textAlign: "center" },
  manualBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  manualSheet: { backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36 },
  manualSheetTitle: { fontSize: 18, fontWeight: "700", color: "#333", marginBottom: 16, textAlign: "center" },
  manualSheetInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, fontSize: 22, textAlign: "center", letterSpacing: 3, color: "#333", backgroundColor: "#f9f9f9", marginBottom: 16 },
  manualSheetSearchButton: { backgroundColor: "#007AFF", borderRadius: 10, padding: 15, alignItems: "center", marginBottom: 10 },
  manualSheetSearchText: { color: "white", fontSize: 16, fontWeight: "700" },
  manualSheetCancelButton: { padding: 12, alignItems: "center" },
  manualSheetCancelText: { color: "#888", fontSize: 16 },
  manualSheetLoading: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, gap: 10 },
  manualSheetLoadingText: { color: "#555", fontSize: 15 },
});
