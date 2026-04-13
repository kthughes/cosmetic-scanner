import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Button, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, Vibration, View } from "react-native";
import { supabase } from "../../lib/supabase";

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || "";

type Screen = "name" | "scanner" | "photoProduct" | "reviewProduct" | "photoIngredients" | "productFound";

interface ProductDetails {
  brand: string;
  name: string;
  product_type: string;
  variant: string;
}

export default function HomeScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [screen, setScreen] = useState<Screen>("name");
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [productFound, setProductFound] = useState<any>(null);
  const [scannedBy, setScannedBy] = useState("");
  const [nameInput, setNameInput] = useState("");

  // Product photo (front of product)
  const [productPhoto, setProductPhoto] = useState<string | null>(null);
  const [productPhotoBase64, setProductPhotoBase64] = useState<string | null>(null);

  // Extracted + editable product details
  const [brand, setBrand] = useState("");
  const [productName, setProductName] = useState("");
  const [productType, setProductType] = useState("");
  const [variant, setVariant] = useState("");

  // Ingredients photo
  const [ingredientPhoto, setIngredientPhoto] = useState<string | null>(null);
  const [ingredientPhotoBase64, setIngredientPhotoBase64] = useState<string | null>(null);

  // Loading states
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const lastScan = useRef<{ barcode: string; time: number } | null>(null);

  // ─── GPT-4o PRODUCT DETAILS PARSER ────────────────────────────
  const parseProductDetailsWithGPT = async (base64Image: string): Promise<ProductDetails> => {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                  detail: "high",
                },
              },
              {
                type: "text",
                text: 'This is a photo of the front of a cosmetic product. Extract the following details and return them as a JSON object with exactly these fields: "brand" (the manufacturer or brand name), "name" (the product name, excluding brand), "product_type" (e.g. shampoo, conditioner, serum, moisturiser, mascara, foundation, lip gloss — one or two words), "variant" (colour, shade, flavour, scent, or edition — empty string if none). Return ONLY the JSON object, no explanation or other text. Example: {"brand": "L\'Oreal", "name": "Elvive", "product_type": "shampoo", "variant": "Coconut"}',
              },
            ],
          },
        ],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

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

  // ─── GPT-4o INGREDIENT PARSER ──────────────────────────────────
  const parseIngredientsWithGPT = async (base64Image: string): Promise<string[]> => {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                  detail: "high",
                },
              },
              {
                type: "text",
                text: "Extract all ingredients from this cosmetic product label. Convert each ingredient to its standard INCI (International Nomenclature of Cosmetic Ingredients) name. Return ONLY a JSON array of INCI ingredient names in the order they appear on the label. Example: [\"AQUA\", \"SODIUM LAURYL SULFATE\", \"GLYCERIN\"]. Do not include any explanation or other text — only the JSON array.",
              },
            ],
          },
        ],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const json = await response.json();
    const content: string = json.choices?.[0]?.message?.content?.trim() ?? "[]";
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  };

  // ─── RESET ─────────────────────────────────────────────────────
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
    lastScan.current = null;
  };

  // ─── NAME SCREEN ───────────────────────────────────────────────
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
            if (!nameInput.trim()) {
              Alert.alert("Please enter your name");
              return;
            }
            setScannedBy(nameInput.trim());
            setScreen("scanner");
          }}
        >
          <Text style={styles.saveButtonText}>Start Scanning →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── PERMISSION CHECK ──────────────────────────────────────────
  if (!permission) {
    return <Text>Loading...</Text>;
  }

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

  // ─── BARCODE SCAN HANDLER ──────────────────────────────────────
  const handleBarcodeScan = async ({ data }: { data: string }) => {
    const now = Date.now();

    if (
      lastScan.current &&
      lastScan.current.barcode === data &&
      now - lastScan.current.time < 3000
    ) {
      return;
    }

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

  // ─── PRODUCT FOUND SCREEN ──────────────────────────────────────
  if (screen === "productFound") {
    return (
      <View style={styles.resultContainer}>
        <Text style={styles.foundTitle}>✅ Product Found!</Text>
        <Text style={styles.foundBrand}>{productFound.brand}</Text>
        <Text style={styles.foundName}>{productFound.name}</Text>
        {productFound.variant && (
          <Text style={styles.foundVariant}>{productFound.variant}</Text>
        )}
        <Text style={styles.foundStatus}>Status: {productFound.status}</Text>
        <TouchableOpacity style={styles.scanAgainButton} onPress={handleScanAgain}>
          <Text style={styles.scanAgainText}>Scan Another Product</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── STEP 1: PHOTOGRAPH PRODUCT FRONT ─────────────────────────
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
      } catch (err) {
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

  // ─── STEP 2: REVIEW & EDIT EXTRACTED DETAILS ──────────────────
  if (screen === "reviewProduct") {
    return (
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.formTitle}>✏️ Review Details</Text>
        <Text style={styles.stepText}>Step 2 of 3 — Correct any mistakes</Text>

        {productPhoto && (
          <Image source={{ uri: productPhoto }} style={styles.thumbPreview} resizeMode="cover" />
        )}

        <Text style={styles.label}>Brand *</Text>
        <TextInput
          style={styles.input}
          value={brand}
          onChangeText={setBrand}
          placeholder="e.g. L'Oreal"
        />

        <Text style={styles.label}>Product Name *</Text>
        <TextInput
          style={styles.input}
          value={productName}
          onChangeText={setProductName}
          placeholder="e.g. Elvive"
        />

        <Text style={styles.label}>Product Type *</Text>
        <TextInput
          style={styles.input}
          value={productType}
          onChangeText={setProductType}
          placeholder="e.g. shampoo, serum, mascara"
        />

        <Text style={styles.label}>Variant / Shade / Scent (optional)</Text>
        <TextInput
          style={styles.input}
          value={variant}
          onChangeText={setVariant}
          placeholder="e.g. Coconut, Blonde, Original"
        />

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

  // ─── STEP 3 + 4: PHOTOGRAPH INGREDIENTS & SAVE ────────────────
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

    const handleSaveAll = async () => {
      if (!ingredientPhoto) {
        Alert.alert("Please take a photo of the ingredients first");
        return;
      }

      setSaving(true);

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
          scanned_by: scannedBy,
          product_image_url: productPhoto,
        }])
        .select()
        .single();

      if (productError) {
        setSaving(false);
        Alert.alert("Error saving product", productError.message);
        return;
      }

      const newProductId = newProduct.id;

      // Link scan record to product
      await supabase
        .from("scans")
        .update({ product_id: newProductId, image_url: ingredientPhoto })
        .eq("barcode", scannedBarcode);

      // Parse ingredients and insert
      if (ingredientPhotoBase64) {
        try {
          const parsedIngredients = await parseIngredientsWithGPT(ingredientPhotoBase64);

          if (parsedIngredients.length > 0) {
            const rows = parsedIngredients.map((name: string, index: number) => ({
              product_id: newProductId,
              ingredient_name: name,
              position: index + 1,
            }));

            const { error: ingredientsError } = await supabase
              .from("product_ingredients")
              .insert(rows);

            if (ingredientsError) {
              console.warn("Failed to save parsed ingredients:", ingredientsError.message);
            }
          }
        } catch (gptError) {
          console.warn("GPT ingredient parsing failed:", gptError);
        }
      }

      setSaving(false);
      handleScanAgain();
      Alert.alert(
        "All saved! ✅",
        "Thank you for building the database!",
        [{ text: "Scan Another", style: "default" }]
      );
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
            {saving ? (
              <View style={styles.parsingContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.parsingText}>Saving & parsing ingredients...</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity style={styles.retakeButton} onPress={handleTakeIngredientPhoto}>
                  <Text style={styles.retakeText}>Retake Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveAll}>
                  <Text style={styles.saveButtonText}>Save & Finish ✅</Text>
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

  // ─── SCANNER SCREEN ────────────────────────────────────────────
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
          <Text style={styles.instructionText}>
            Position barcode inside the box
          </Text>
          <Text style={styles.instructionSubText}>
            Hold steady — curved bottles may need extra time
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "column",
  },
  topOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 10,
  },
  scannerName: {
    color: "white",
    fontSize: 14,
    opacity: 0.8,
  },
  middleRow: {
    flexDirection: "row",
    height: 200,
  },
  sideOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  targetBox: {
    width: 280,
    height: 200,
    borderColor: "transparent",
    borderWidth: 2,
  },
  targetBoxFlash: {
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  corner: {
    position: "absolute",
    width: 20,
    height: 20,
    borderColor: "white",
    borderWidth: 3,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  bottomOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  instructionText: {
    color: "white",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 8,
  },
  instructionSubText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    textAlign: "center",
  },
  resultContainer: {
    flex: 1,
    padding: 30,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "white",
  },
  foundTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    color: "green",
  },
  foundBrand: {
    fontSize: 16,
    color: "#666",
    marginBottom: 5,
  },
  foundName: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 5,
    textAlign: "center",
  },
  foundVariant: {
    fontSize: 16,
    color: "#888",
    marginBottom: 10,
  },
  foundStatus: {
    fontSize: 14,
    color: "#aaa",
    marginBottom: 30,
  },
  scanAgainButton: {
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
  },
  scanAgainText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  formContainer: {
    flex: 1,
    padding: 25,
    backgroundColor: "white",
    justifyContent: "center",
  },
  scrollContainer: {
    padding: 25,
    backgroundColor: "white",
    paddingTop: 60,
    paddingBottom: 40,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 5,
    color: "#333",
  },
  formSubtitle: {
    fontSize: 14,
    color: "#888",
    marginBottom: 10,
    lineHeight: 20,
  },
  stepText: {
    fontSize: 13,
    color: "#007AFF",
    fontWeight: "600",
    marginBottom: 12,
    marginTop: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 5,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#f9f9f9",
  },
  saveButton: {
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 25,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  cancelButton: {
    padding: 15,
    alignItems: "center",
    marginTop: 10,
  },
  cancelText: {
    color: "#888",
    fontSize: 16,
  },
  nameContainer: {
    flex: 1,
    padding: 30,
    justifyContent: "center",
    backgroundColor: "white",
  },
  nameTitle: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
  },
  nameSubtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 30,
    textAlign: "center",
    lineHeight: 24,
  },
  photoButton: {
    backgroundColor: "#34C759",
    padding: 20,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
    marginBottom: 10,
  },
  photoButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  photoContainer: {
    marginTop: 15,
    alignItems: "center",
    width: "100%",
  },
  photoPreview: {
    width: "100%",
    height: 200,
    borderRadius: 10,
    marginBottom: 15,
  },
  thumbPreview: {
    width: "100%",
    height: 120,
    borderRadius: 10,
    marginBottom: 5,
    marginTop: 8,
  },
  retakeButton: {
    padding: 10,
    marginBottom: 5,
  },
  retakeText: {
    color: "#007AFF",
    fontSize: 16,
  },
  parsingContainer: {
    alignItems: "center",
    paddingVertical: 20,
  },
  parsingText: {
    marginTop: 12,
    fontSize: 15,
    color: "#555",
  },
});
