import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useRef, useState } from "react";
import { Alert, Button, Image, StyleSheet, Text, TextInput, TouchableOpacity, Vibration, View } from "react-native";
import { supabase } from "../../lib/supabase";

type Screen = "name" | "scanner" | "addProduct" | "addIngredients" | "productFound";

export default function HomeScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [screen, setScreen] = useState<Screen>("name");
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [productFound, setProductFound] = useState<any>(null);
  const [savedProductId, setSavedProductId] = useState<string | null>(null);
  const [brand, setBrand] = useState("");
  const [productName, setProductName] = useState("");
  const [variant, setVariant] = useState("");
  const [saving, setSaving] = useState(false);
  const [scannedBy, setScannedBy] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [ingredientPhoto, setIngredientPhoto] = useState<string | null>(null);
  const lastScan = useRef<{ barcode: string; time: number } | null>(null);

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

    // Save to scans table
    await supabase.from("scans").insert([{ barcode: data }]);

    // Look up barcode in products table
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
      setScreen("addProduct");
    }
  };

  // ─── SAVE PRODUCT HANDLER ──────────────────────────────────────
  const handleSaveProduct = async () => {
    if (!productName.trim()) {
      Alert.alert("Please enter a product name");
      return;
    }
    if (!brand.trim()) {
      Alert.alert("Please enter a brand name");
      return;
    }

    setSaving(true);

    const { data: newProduct, error } = await supabase
      .from("products")
      .insert([{
        barcode: scannedBarcode,
        name: productName.trim(),
        brand: brand.trim(),
        variant: variant.trim() || null,
        status: "unverified",
        scanned_by: scannedBy,
      }])
      .select()
      .single();

    setSaving(false);

    if (error) {
      Alert.alert("Error saving product", error.message);
    } else {
      setSavedProductId(newProduct.id);
      setBrand("");
      setProductName("");
      setVariant("");
      setScreen("addIngredients");
    }
  };

  // ─── TAKE INGREDIENTS PHOTO ────────────────────────────────────
  const handleTakeIngredientPhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        allowsEditing: false,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });

      if (!result.canceled && result.assets[0]) {
        setIngredientPhoto(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert("Error opening camera", "Please try again");
    }
  };

  // ─── SAVE INGREDIENTS ──────────────────────────────────────────
  const handleSaveIngredients = async () => {
    if (!ingredientPhoto) {
      Alert.alert("Please take a photo of the ingredients first");
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from("scans")
      .update({
        product_id: savedProductId,
        image_url: ingredientPhoto,
      })
      .eq("barcode", scannedBarcode);

    setSaving(false);

    if (error) {
      Alert.alert("Error saving ingredients", error.message);
    } else {
      setScreen("scanner");
      setScannedBarcode(null);
      setSavedProductId(null);
      setIngredientPhoto(null);
      lastScan.current = null;
      Alert.alert(
        "All saved! ✅",
        "Thank you for building the database!",
        [{ text: "Scan Another", style: "default" }]
      );
    }
  };

  // ─── RESET ─────────────────────────────────────────────────────
  const handleScanAgain = () => {
    setScreen("scanner");
    setScannedBarcode(null);
    setProductFound(null);
    setSavedProductId(null);
    setBrand("");
    setProductName("");
    setVariant("");
    setIngredientPhoto(null);
    lastScan.current = null;
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

  // ─── ADD PRODUCT FORM ──────────────────────────────────────────
  if (screen === "addProduct") {
    return (
      <View style={styles.formContainer}>
        <Text style={styles.formTitle}>New Product! 🆕</Text>
        <Text style={styles.formSubtitle}>Barcode: {scannedBarcode}</Text>
        <Text style={styles.formSubtitle}>
          Scanning as: <Text style={{ fontWeight: "bold" }}>{scannedBy}</Text>
        </Text>

        <Text style={styles.stepText}>Step 1 of 2 — Product Details</Text>

        <Text style={styles.label}>Brand *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. L'Oreal"
          value={brand}
          onChangeText={setBrand}
        />

        <Text style={styles.label}>Product Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Elvive Shampoo"
          value={productName}
          onChangeText={setProductName}
        />

        <Text style={styles.label}>Colour / Flavour / Variant (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Coconut, Blonde, Original"
          value={variant}
          onChangeText={setVariant}
        />

        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSaveProduct}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? "Saving..." : "Next: Add Ingredients →"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={handleScanAgain}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── ADD INGREDIENTS SCREEN ────────────────────────────────────
  if (screen === "addIngredients") {
    return (
      <View style={styles.formContainer}>
        <Text style={styles.formTitle}>📸 Photograph Ingredients</Text>
        <Text style={styles.formSubtitle}>
          Step 2 of 2 — Take a clear photo of the ingredients list on the product label
        </Text>
        <Text style={styles.formSubtitle}>
          Make sure all the text is visible and in focus
        </Text>

        {ingredientPhoto ? (
          <View style={styles.photoContainer}>
            <Image
              source={{ uri: ingredientPhoto }}
              style={styles.photoPreview}
              resizeMode="cover"
            />
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={handleTakeIngredientPhoto}
            >
              <Text style={styles.retakeText}>Retake Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveIngredients}
              disabled={saving}
            >
              <Text style={styles.saveButtonText}>
                {saving ? "Saving..." : "Save & Finish ✅"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.photoButton}
            onPress={handleTakeIngredientPhoto}
          >
            <Text style={styles.photoButtonText}>📷 Take Photo of Ingredients</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.cancelButton} onPress={handleScanAgain}>
          <Text style={styles.cancelText}>Skip & Scan Another</Text>
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
    marginBottom: 15,
    marginTop: 5,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 5,
    marginTop: 10,
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
  },
  photoPreview: {
    width: "100%",
    height: 200,
    borderRadius: 10,
    marginBottom: 15,
  },
  retakeButton: {
    padding: 10,
    marginBottom: 10,
  },
  retakeText: {
    color: "#007AFF",
    fontSize: 16,
  },
});