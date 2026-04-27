import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  Image,
  Keyboard,
  KeyboardAvoidingView,
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

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || "";

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

  const [parsedIngredients, setParsedIngredients] = useState<string[]>([]);

  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Keyboard visibility must be tracked at component level — hooks can't live inside conditionals
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const lastScan = useRef<{ barcode: string; time: number } | null>(null);
  const ingredientInputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ─── HELPERS ───────────────────────────────────────────────────────────────

  const uploadPhotoBase64 = async (
    base64: string,
    bucket: string,
    filename: string
  ): Promise<string | null> => {
    try {
      console.log(`[upload] starting upload to ${bucket} as ${filename}`);

      // Remove data URI prefix if present
      const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");

      // Decode base64 to binary buffer
      const binaryString = Buffer.from(base64Data, "base64");

      const { error } = await supabase.storage
        .from(bucket)
        .upload(filename, binaryString, { contentType: "image/jpeg", upsert: true });

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

  const parseProductDetailsWithGPT = async (base64Image: string): Promise<ProductDetails> => {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: "high" },
            },
            {
              type: "text",
              text: 'This is a photo of the front of a cosmetic product. Extract the following details and return them as a JSON object with exactly these fields: "brand" (the manufacturer or brand name), "name" (the product name, excluding brand), "product_type" (e.g. shampoo, conditioner, serum, moisturiser, mascara, foundation, lip gloss — one or two words), "variant" (colour, shade, flavour, scent, or edition — empty string if none). Return ONLY the JSON object, no explanation or other text. Example: {"brand": "L\'Oreal", "name": "Elvive", "product_type": "shampoo", "variant": "Coconut"}',
            },
          ],
        }],
        max_tokens: 300,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);

    const json = await response.json();
    const content: string = json.choices?.[0]?.message?.content?.trim() ?? "{}";
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      brand: parsed.brand ?? "",
      name: parsed.name ?? "",
      product_type: parsed.product_type ?? "",
      variant: parsed.variant ?? "",
    };
  };

  const parseIngredientsWithGPT = async (base64Image: string): Promise<string[]> => {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: "high" },
            },
            {
              type: "text",
              text: 'Extract all ingredients from this cosmetic product label exactly as they appear — do not convert to INCI or change the spelling. Do NOT guess any ingredient you cannot read clearly. If a word is unclear or uncertain, skip it entirely rather than guessing. Never invent ingredient names. Return ONLY a JSON object with one field: "ingredients" (a JSON array of strings in the order they appear on the label). Example: {"ingredients": ["Water", "Glycerin", "Sodium Lauryl Sulfate"]}. Do not include any explanation or other text — only the JSON object.',
            },
          ],
        }],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);

    const json = await response.json();
    const content: string = json.choices?.[0]?.message?.content?.trim() ?? "{}";
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed.ingredients) ? parsed.ingredients : [];
  };

  // Text-only call using gpt-4o-mini — runs in the background after save completes
  const convertToINCIWithGPT = async (
    ingredients: string[]
  ): Promise<Array<{ raw: string; inci: string }>> => {
    const numbered = ingredients.map((ing, i) => `${i + 1}. ${ing}`).join("\n");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: `Convert these cosmetic ingredient names to their official INCI (International Nomenclature of Cosmetic Ingredients) names. Return ONLY a JSON array of objects with 'raw' and 'inci' fields. If you cannot find an INCI name, use the raw name as the inci value. Do not include any explanation.\n\n${numbered}`,
        }],
        max_tokens: 2000,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);

    const json = await response.json();
    const content: string = json.choices?.[0]?.message?.content?.trim() ?? "[]";
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed)
      ? parsed.map((item: any) => ({
          raw: typeof item.raw === "string" ? item.raw : "",
          inci: typeof item.inci === "string" ? item.inci : (item.raw ?? ""),
        }))
      : ingredients.map(ing => ({ raw: ing, inci: ing }));
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
    setParsedIngredients([]);
    lastScan.current = null;
  };

  const handleConfirmSave = async () => {
    setSaving(true);

    const filename = `${scannedBarcode}_${Date.now()}.jpg`;

    // Upload both photos in parallel — falls back to null if either fails
    const [productPhotoUrl, ingredientPhotoUrl] = await Promise.all([
      productPhotoBase64 ? uploadPhotoBase64(productPhotoBase64, "product-photo", filename) : Promise.resolve(null),
      ingredientPhotoBase64 ? uploadPhotoBase64(ingredientPhotoBase64, "ingredients-photo", filename) : Promise.resolve(null),
    ]);

    // Insert product
    const { data: newProduct, error: productError } = await supabase
      .from("products")
      .insert([{
        barcode: scannedBarcode,
        brand: brand.trim(),
        name: productName.trim(),
        product_type: productType.trim(),
        variant: variant.trim() || null,
        status: "unverified",
        qc_status: "pending",
        scanned_by: scannedBy,
        product_image_url: productPhotoUrl,
      }])
      .select()
      .single();

    if (productError) {
      setSaving(false);
      Alert.alert("Error saving product", productError.message);
      return;
    }

    const newProductId = newProduct.id;

    await supabase
      .from("scans")
      .update({ product_id: newProductId, image_url: ingredientPhotoUrl })
      .eq("barcode", scannedBarcode);

    // Insert raw text immediately so data is never lost
    if (parsedIngredients.length > 0) {
      const rows = parsedIngredients.map((text, index) => ({
        product_id: newProductId,
        ingredient_name: text,
        raw_text: text,
        position: index + 1,
      }));

      const { error: ingredientsError } = await supabase
        .from("product_ingredients")
        .insert(rows);

      if (ingredientsError) {
        console.warn("Failed to save ingredients:", ingredientsError.message);
      }
    }

    setSaving(false);
    handleScanAgain();
    Alert.alert("All saved! ✅", "Thank you for building the database!", [
      { text: "Scan Another", style: "default" },
    ]);

    // Background INCI conversion — runs after UI resets; raw text is already safe in DB
    if (parsedIngredients.length > 0) {
      convertToINCIWithGPT(parsedIngredients)
        .then(async (inciResults) => {
          for (let i = 0; i < inciResults.length; i++) {
            await supabase
              .from("product_ingredients")
              .update({ ingredient_name: inciResults[i].inci })
              .eq("product_id", newProductId)
              .eq("position", i + 1);
          }
        })
        .catch(err => {
          console.warn("Background INCI conversion failed:", err);
        });
    }
  };

  const handleBarcodeScan = async ({ data }: { data: string }) => {
    const now = Date.now();
    if (lastScan.current?.barcode === data && now - lastScan.current.time < 3000) return;

    lastScan.current = { barcode: data, time: now };
    setScannedBarcode(data);

    Vibration.vibrate(100);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    await supabase.from("scans").insert([{ barcode: data }]);

    const { data: product } = await supabase
      .from("products")
      .select("*")
      .eq("barcode", data)
      .single();

    if (product) {
      setProductFound(product);
      setScreen("productFound");
    } else {
      setProductFound(null);
      setScreen("photoProduct");
    }
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
        <Text style={styles.foundStatus}>Status: {productFound.status}</Text>
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
      if (!productPhotoBase64) return;
      setParsing(true);
      try {
        const details = await parseProductDetailsWithGPT(productPhotoBase64);
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

  // Step 3 — photograph ingredients label
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
        }
      } catch {
        Alert.alert("Error opening camera", "Please try again");
      }
    };

    const handleAnalyseIngredients = async () => {
      if (!ingredientPhotoBase64) return;
      setParsing(true);
      try {
        const ingredients = await parseIngredientsWithGPT(ingredientPhotoBase64);
        setParsedIngredients(ingredients);
        setScreen("reviewIngredients");
      } catch {
        Alert.alert("Could not analyse photo", "Please try again or check your connection.");
      } finally {
        setParsing(false);
      }
    };

    return (
      <View style={styles.formContainer}>
        <Text style={styles.formTitle}>📸 Photograph Ingredients</Text>
        <Text style={styles.stepText}>Step 3 of 3 — Ingredients list</Text>
        <Text style={styles.formSubtitle}>
          Take a clear photo of the full ingredients list. Make sure all text is visible and in focus.
        </Text>

        {ingredientPhoto ? (
          <View style={styles.photoContainer}>
            <Image source={{ uri: ingredientPhoto }} style={styles.photoPreview} resizeMode="cover" />
            {parsing ? (
              <View style={styles.parsingContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.parsingText}>Analysing ingredients with AI...</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity style={styles.retakeButton} onPress={handleTakeIngredientPhoto}>
                  <Text style={styles.retakeText}>Retake Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleAnalyseIngredients}>
                  <Text style={styles.saveButtonText}>Analyse Ingredients →</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <TouchableOpacity style={styles.photoButton} onPress={handleTakeIngredientPhoto}>
            <Text style={styles.photoButtonText}>📷 Take Photo of Ingredients</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.cancelButton} onPress={() => setScreen("reviewProduct")}>
          <Text style={styles.cancelText}>← Back to Review</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Step 4 — review ingredient list before saving
  if (screen === "reviewIngredients") {
    const count = parsedIngredients.length;
    const tooFew = count < 3;
    const tooMany = count > 60;
    const hasEmpty = parsedIngredients.some(i => i.trim() === "");

    const handleRetake = () => {
      setIngredientPhoto(null);
      setIngredientPhotoBase64(null);
      setParsedIngredients([]);
      ingredientInputRefs.current = [];
      setScreen("photoIngredients");
    };

    const handleUpdateIngredient = (index: number, text: string) => {
      setParsedIngredients(prev => prev.map((item, i) => i === index ? text : item));
    };

    const handleDeleteIngredient = (index: number) => {
      setParsedIngredients(prev => prev.filter((_, i) => i !== index));
      ingredientInputRefs.current.splice(index, 1);
    };

    const handleAddIngredient = () => {
      const newIndex = parsedIngredients.length;
      setParsedIngredients(prev => [...prev, ""]);
      setTimeout(() => { ingredientInputRefs.current[newIndex]?.focus(); }, 50);
    };

    return (
      <KeyboardAvoidingView
        style={styles.reviewKAV}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.reviewScroll}
          contentContainerStyle={styles.reviewScrollContent}
          keyboardShouldPersistTaps="handled"
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
            Please check these match your product label before saving.
          </Text>

          <View style={styles.ingredientList}>
            {parsedIngredients.map((ingredient, index) => (
              <View key={index} style={styles.editableIngredientRow}>
                <Text style={styles.editableIngredientNumber}>{index + 1}.</Text>
                <TextInput
                  ref={ref => { ingredientInputRefs.current[index] = ref; }}
                  style={styles.editableIngredientInput}
                  value={ingredient}
                  onChangeText={text => handleUpdateIngredient(index, text)}
                  placeholder="Ingredient name"
                  placeholderTextColor="#bbb"
                  autoCapitalize="none"
                  returnKeyType="next"
                  onSubmitEditing={() => {
                    const next = ingredientInputRefs.current[index + 1];
                    if (next) next.focus();
                    else handleAddIngredient();
                  }}
                />
                <TouchableOpacity
                  style={styles.deleteIngredientButton}
                  onPress={() => handleDeleteIngredient(index)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.deleteIngredientText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={styles.addIngredientButton} onPress={handleAddIngredient}>
              <Text style={styles.addIngredientText}>＋ Add Ingredient</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {keyboardVisible && (
          <View style={styles.keyboardToolbar}>
            <TouchableOpacity onPress={() => Keyboard.dismiss()}>
              <Text style={styles.keyboardToolbarDone}>Done ✓</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.reviewFooter}>
          {saving ? (
            <View style={styles.parsingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.parsingText}>Uploading & converting ingredients...</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.saveButton, hasEmpty && styles.buttonDisabled]}
                onPress={hasEmpty ? undefined : handleConfirmSave}
              >
                <Text style={styles.saveButtonText}>✅ Save All {count} Ingredients</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.retakeIngredientButton} onPress={handleRetake}>
                <Text style={styles.retakeIngredientText}>📸 Retake Photo</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Barcode scanner (default screen after name entry)
  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        onBarcodeScanned={handleBarcodeScan}
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "pdf417", "qr"],
        }}
      />
      <View style={styles.overlay}>
        <View style={styles.topOverlay}>
          <Text style={styles.scannerName}>👤 {scannedBy}</Text>
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
        </View>
      </View>
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
  scannerName: { color: "white", fontSize: 14, opacity: 0.8 },
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
  keyboardToolbar: { backgroundColor: "#f2f2f7", borderTopWidth: 1, borderTopColor: "#c8c8cc", paddingHorizontal: 16, paddingVertical: 8, flexDirection: "row", justifyContent: "flex-end", alignItems: "center" },
  keyboardToolbarDone: { color: "#007AFF", fontSize: 16, fontWeight: "600" },
  ingredientCount: { fontSize: 18, fontWeight: "700", color: "#333", marginTop: 12, marginBottom: 8 },
  ingredientWarning: { fontSize: 14, color: "#c0392b", backgroundColor: "#fdecea", borderRadius: 8, padding: 10, marginBottom: 16, lineHeight: 20 },
  ingredientList: { marginBottom: 12 },
  editableIngredientRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#f4f4f4", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 6 },
  editableIngredientNumber: { fontSize: 13, color: "#999", width: 28, flexShrink: 0 },
  editableIngredientInput: { flex: 1, fontSize: 14, color: "#333", paddingVertical: 4 },
  deleteIngredientButton: { paddingLeft: 8 },
  deleteIngredientText: { fontSize: 15, color: "#bbb", fontWeight: "600" },
  addIngredientButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: "#d0d0d0", borderStyle: "dashed", marginTop: 4 },
  addIngredientText: { fontSize: 14, color: "#888", fontWeight: "500" },
  retakeIngredientButton: { padding: 15, alignItems: "center", marginTop: 8, borderWidth: 1, borderColor: "#007AFF", borderRadius: 10 },
  retakeIngredientText: { color: "#007AFF", fontSize: 16, fontWeight: "600" },
});
