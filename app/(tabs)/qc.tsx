// Cleaned up on 2026-06-03
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from "react-native-draggable-flatlist";
import { supabase } from "../../lib/supabase";

// TODO: DEVELOPER REVIEW — PIN is hardcoded in plain text. Before production, move this to an
// environment variable or a server-side check so it cannot be read from the app bundle.
const CORRECT_PIN = "1234";

interface Ingredient {
  ingredient_name: string;
  position: number;
}

interface PendingProduct {
  id: string;
  brand: string;
  name: string;
  variant: string | null;
  product_type: string;
  barcode: string;
  scanned_by: string;
  created_at: string;
  product_image_url: string | null;
  ingredient_image_url: string | null;
  ingredient_image_url_2: string | null;
  qc_status: "pending" | "flagged";
  product_ingredients: Ingredient[];
  ingredientPhotoUrl: string | null;
}

interface EditIngredient {
  id: string;
  name: string;
}

export default function QCScreen() {
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);

  const [products, setProducts] = useState<PendingProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // ─── EDIT MODAL STATE ─────────────────────────────────────────
  const [editingProduct, setEditingProduct] = useState<PendingProduct | null>(null);
  const [editBrand, setEditBrand] = useState("");
  const [editName, setEditName] = useState("");
  const [editVariant, setEditVariant] = useState("");
  const [editProductType, setEditProductType] = useState("");
  const [editIngredients, setEditIngredients] = useState<EditIngredient[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [ingredientTexts, setIngredientTexts] = useState<Record<string, string>>({});

  // ─── PIN GATE ─────────────────────────────────────────────────
  const handlePinSubmit = () => {
    if (pin === CORRECT_PIN) {
      setPinError(false);
      setAuthed(true);
    } else {
      setPinError(true);
      setPin("");
    }
  };

  // ─── FETCH PENDING PRODUCTS ───────────────────────────────────
  useEffect(() => {
    if (!authed) return;
    const fetchPending = async () => {
      setLoading(true);

      try {
        // Step 1: fetch pending products with their ingredients
        const { data: productData, error: productError } = await supabase
          .from("products")
          .select("*, product_ingredients(ingredient_name, position)")
          .in("qc_status", ["pending", "flagged"])
          .order("created_at", { ascending: false });

        if (productError) {
          Alert.alert("Error loading products", productError.message);
          return; // finally block resets loading state
        }

        // Step 2: for each product, fetch its most recent scan image separately.
        // Supabase cannot auto-detect the FK between products and scans, so we query individually.
        const combined: PendingProduct[] = await Promise.all(
          (productData ?? []).map(async (product: any) => {
            const { data: scan } = await supabase
              .from("scans")
              .select("image_url")
              .eq("product_id", product.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            return {
              ...product,
              ingredientPhotoUrl: scan?.image_url ?? null,
            };
          })
        );

        setProducts(combined);

        const texts: Record<string, string> = {};
        combined.forEach(p => {
          texts[p.id] = [...(p.product_ingredients ?? [])]
            .sort((a, b) => a.position - b.position)
            .map(i => i.ingredient_name)
            .join(", ");
        });
        setIngredientTexts(texts);
      } catch (e) {
        // Network-level failure
        Alert.alert("Connection error", "Could not load products. Please check your internet connection.");
        console.warn("[qc] fetchPending threw:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchPending();
  }, [authed]);

  // ─── TOAST ────────────────────────────────────────────────────
  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  // ─── APPROVE ──────────────────────────────────────────────────
  const handleApprove = async (productId: string) => {
    try {
      const rawText = ingredientTexts[productId] ?? "";
      const newIngredients = rawText
        .split(",")
        .map(s => s.trim())
        .filter(s => s.length > 0);

      await supabase.from("product_ingredients").delete().eq("product_id", productId);

      if (newIngredients.length > 0) {
        const rows = newIngredients.map((name, index) => ({
          product_id: productId,
          ingredient_name: name,
          raw_text: name,
          position: index + 1,
        }));
        const { error: insertError } = await supabase.from("product_ingredients").insert(rows);
        if (insertError) {
          Alert.alert("Error saving ingredients", insertError.message);
          return;
        }
      }

      const { error } = await supabase
        .from("products")
        .update({ qc_status: "approved", status: "verified" })
        .eq("id", productId);
      if (error) {
        Alert.alert("Error", error.message);
        return;
      }
      setProducts(prev => prev.filter(p => p.id !== productId));
      showToast("Approved! ✅");
    } catch (e) {
      Alert.alert("Connection error", "Could not approve product. Please check your internet connection.");
      console.warn("[qc] handleApprove threw:", e);
    }
  };

  // ─── EDIT ─────────────────────────────────────────────────────
  const handleOpenEdit = (product: PendingProduct) => {
    setEditBrand(product.brand);
    setEditName(product.name);
    setEditVariant(product.variant ?? "");
    setEditProductType(product.product_type);
    setEditIngredients(
      [...(product.product_ingredients ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((ing, i) => ({ id: `${i}-${Date.now()}`, name: ing.ingredient_name }))
    );
    setEditingProduct(product);
  };

  const handleSaveAndApprove = async () => {
    if (!editingProduct) return;
    setSavingEdit(true);
    try {
      const { error: productError } = await supabase
        .from("products")
        .update({
          brand: editBrand.trim(),
          name: editName.trim(),
          variant: editVariant.trim() || null,
          product_type: editProductType.trim(),
          qc_status: "approved",
          status: "verified",
        })
        .eq("id", editingProduct.id);

      if (productError) {
        Alert.alert("Error", productError.message);
        return;
      }

      // Replace all ingredients — delete then re-insert to respect position order
      await supabase.from("product_ingredients").delete().eq("product_id", editingProduct.id);

      if (editIngredients.length > 0) {
        const rows = editIngredients.map((ing, index) => ({
          product_id: editingProduct.id,
          ingredient_name: ing.name,
          raw_text: ing.name,
          position: index + 1,
        }));
        const { error: insertError } = await supabase.from("product_ingredients").insert(rows);
        if (insertError) {
          Alert.alert("Error saving ingredients", insertError.message);
          return;
        }
      }

      setProducts(prev => prev.filter(p => p.id !== editingProduct.id));
      setEditingProduct(null);
      showToast("Saved & Approved ✅");
    } catch (e) {
      Alert.alert("Connection error", "Could not save. Please check your internet connection.");
      console.warn("[qc] handleSaveAndApprove threw:", e);
    } finally {
      setSavingEdit(false);
    }
  };

  // ─── REMOVE ───────────────────────────────────────────────────
  const handleRemove = (productId: string) => {
    Alert.alert(
      "Remove Product",
      "This will permanently delete the product and all its ingredients.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              // Delete ingredients first to respect FK constraint
              await supabase.from("product_ingredients").delete().eq("product_id", productId);
              const { error } = await supabase.from("products").delete().eq("id", productId);
              if (error) {
                Alert.alert("Error", error.message);
                return;
              }
              setProducts(prev => prev.filter(p => p.id !== productId));
              showToast("Removed 🗑️");
            } catch (e) {
              Alert.alert("Connection error", "Could not remove product. Please check your internet connection.");
              console.warn("[qc] handleRemove threw:", e);
            }
          },
        },
      ]
    );
  };

  // ─── PIN SCREEN ───────────────────────────────────────────────
  if (!authed) {
    return (
      <View style={styles.pinContainer}>
        <Text style={styles.pinTitle}>🔒 QC Admin</Text>
        <Text style={styles.pinSubtitle}>Enter PIN to continue</Text>
        <TextInput
          style={[styles.pinInput, pinError && styles.pinInputError]}
          value={pin}
          onChangeText={text => { setPin(text); setPinError(false); }}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={4}
          placeholder="••••"
          placeholderTextColor="#bbb"
          autoFocus
          onSubmitEditing={handlePinSubmit}
        />
        {pinError && (
          <Text style={styles.pinError}>Incorrect PIN</Text>
        )}
        <TouchableOpacity style={styles.pinButton} onPress={handlePinSubmit}>
          <Text style={styles.pinButtonText}>Unlock →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── LOADING ──────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading pending products...</Text>
      </View>
    );
  }

  // ─── EMPTY STATE ──────────────────────────────────────────────
  if (products.length === 0) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.emptyTitle}>All caught up! ✅</Text>
        <Text style={styles.emptySubtitle}>No pending products</Text>
      </View>
    );
  }

  // ─── PRODUCT LIST ─────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>QC Review</Text>
        <Text style={styles.headerCount}>{products.length} pending</Text>
      </View>

      {/* Edit modal */}
      <Modal visible={!!editingProduct} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditingProduct(null)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Product</Text>
            <TouchableOpacity onPress={handleSaveAndApprove} disabled={savingEdit}>
              <Text style={[styles.modalSave, savingEdit && { opacity: 0.4 }]}>💾 Save & Approve</Text>
            </TouchableOpacity>
          </View>

          {savingEdit ? (
            <View style={styles.centeredContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
            </View>
          ) : (
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
              <DraggableFlatList
                data={editIngredients}
                keyExtractor={item => item.id}
                onDragEnd={({ data }) => setEditIngredients(data)}
                contentContainerStyle={styles.modalScroll}
                ListHeaderComponent={
                  <View>
                    <Text style={styles.modalSectionTitle}>Product Details</Text>
                    <Text style={styles.modalLabel}>Brand</Text>
                    <TextInput style={styles.modalInput} value={editBrand} onChangeText={setEditBrand} autoCapitalize="words" />
                    <Text style={styles.modalLabel}>Name</Text>
                    <TextInput style={styles.modalInput} value={editName} onChangeText={setEditName} autoCapitalize="words" />
                    <Text style={styles.modalLabel}>Variant (optional)</Text>
                    <TextInput style={styles.modalInput} value={editVariant} onChangeText={setEditVariant} autoCapitalize="words" />
                    <Text style={styles.modalLabel}>Product Type</Text>
                    <TextInput style={styles.modalInput} value={editProductType} onChangeText={setEditProductType} autoCapitalize="none" />
                    <Text style={styles.modalSectionTitle}>Ingredients ({editIngredients.length})</Text>
                    <Text style={styles.modalHint}>Long-press ≡ to drag and reorder</Text>
                  </View>
                }
                ListFooterComponent={
                  <TouchableOpacity
                    style={styles.modalAddButton}
                    onPress={() => setEditIngredients(prev => [...prev, { id: `new-${Date.now()}`, name: "" }])}
                  >
                    <Text style={styles.modalAddButtonText}>＋ Add Ingredient</Text>
                  </TouchableOpacity>
                }
                renderItem={({ item, drag, isActive }: RenderItemParams<EditIngredient>) => (
                  <ScaleDecorator>
                    <View style={[styles.editIngredientRow, isActive && styles.editIngredientRowActive]}>
                      <Pressable onLongPress={drag} style={styles.dragHandle}>
                        <Text style={styles.dragHandleIcon}>≡</Text>
                      </Pressable>
                      <TextInput
                        style={styles.editIngredientInput}
                        value={item.name}
                        onChangeText={text =>
                          setEditIngredients(prev =>
                            prev.map(i => i.id === item.id ? { ...i, name: text } : i)
                          )
                        }
                        autoCapitalize="none"
                        placeholder="Ingredient name"
                        placeholderTextColor="#bbb"
                      />
                      <TouchableOpacity
                        onPress={() => setEditIngredients(prev => prev.filter(i => i.id !== item.id))}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.editIngredientDelete}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </ScaleDecorator>
                )}
              />
            </KeyboardAvoidingView>
          )}
        </View>
      </Modal>

      {/* Toast */}
      {toast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.list}>
        {[...products]
          .sort((a, b) => {
            if (a.qc_status === "flagged" && b.qc_status !== "flagged") return -1;
            if (b.qc_status === "flagged" && a.qc_status !== "flagged") return 1;
            return 0;
          })
          .map(product => {
          const ingredientPhotoUrl = product.ingredientPhotoUrl;
          const date = new Date(product.created_at).toLocaleDateString("en-GB", {
            day: "numeric", month: "short", year: "numeric",
          });

          return (
            <View key={product.id} style={styles.card}>
              {product.qc_status === "flagged" && (
                <View style={styles.flaggedBanner}>
                  <Text style={styles.flaggedBannerText}>🚨 Flagged for Review</Text>
                </View>
              )}
              {/* Product header */}
              <Text style={styles.cardBrand}>{product.brand}</Text>
              <Text style={styles.cardName}>{product.name}</Text>
              {product.variant ? (
                <Text style={styles.cardVariant}>{product.variant}</Text>
              ) : null}
              <Text style={styles.cardMeta}>{product.product_type}</Text>

              {/* Meta row */}
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Scanned by</Text>
                <Text style={styles.metaValue}>{product.scanned_by}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Date</Text>
                <Text style={styles.metaValue}>{date}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Barcode</Text>
                <Text style={styles.metaValue}>{product.barcode}</Text>
              </View>

              {/* Photos — stacked vertically */}
              {product.product_image_url ? (
                <View style={styles.photoBlock}>
                  <Text style={styles.photoLabel}>Product</Text>
                  <Image
                    source={{ uri: product.product_image_url }}
                    style={styles.productPhoto}
                    resizeMode="cover"
                  />
                </View>
              ) : null}
              {ingredientPhotoUrl ? (
                <View style={styles.photoBlock}>
                  <Text style={styles.photoLabel}>Ingredients — pinch to zoom</Text>
                  <ScrollView
                    style={styles.ingredientPhotoScroll}
                    maximumZoomScale={4}
                    minimumZoomScale={1}
                    bouncesZoom
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                    centerContent
                  >
                    <Image
                      source={{ uri: ingredientPhotoUrl }}
                      style={styles.ingredientPhoto}
                      resizeMode="cover"
                    />
                  </ScrollView>
                  {product.ingredient_image_url_2 ? (
                    <ScrollView
                      style={[styles.ingredientPhotoScroll, { marginTop: 8 }]}
                      maximumZoomScale={4}
                      minimumZoomScale={1}
                      bouncesZoom
                      showsHorizontalScrollIndicator={false}
                      showsVerticalScrollIndicator={false}
                      centerContent
                    >
                      <Image
                        source={{ uri: product.ingredient_image_url_2 }}
                        style={styles.ingredientPhoto}
                        resizeMode="cover"
                      />
                    </ScrollView>
                  ) : null}
                </View>
              ) : null}

              {/* Ingredient list */}
              <View style={styles.ingredientSection}>
                <Text style={styles.ingredientSectionTitle}>Ingredients</Text>
                <TextInput
                  style={styles.ingredientInput}
                  multiline
                  value={ingredientTexts[product.id] ?? ""}
                  onChangeText={text =>
                    setIngredientTexts(prev => ({ ...prev, [product.id]: text }))
                  }
                  placeholder="No ingredients"
                  placeholderTextColor="#bbb"
                  autoCapitalize="none"
                />
              </View>

              {/* Actions */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.approveButton}
                  onPress={() => handleApprove(product.id)}
                >
                  <Text style={styles.approveText}>✅ Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => handleOpenEdit(product)}
                >
                  <Text style={styles.editText}>✏️ Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => handleRemove(product.id)}
                >
                  <Text style={styles.removeText}>🗑️ Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f4f4f8",
  },

  // ─── PIN ───────────────────────────────────────────────────────
  pinContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    backgroundColor: "white",
  },
  pinTitle: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#333",
  },
  pinSubtitle: {
    fontSize: 15,
    color: "#888",
    marginBottom: 32,
  },
  pinInput: {
    borderWidth: 2,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    textAlign: "center",
    width: 160,
    letterSpacing: 8,
    marginBottom: 8,
    color: "#333",
    backgroundColor: "#f9f9f9",
  },
  pinInputError: {
    borderColor: "#e74c3c",
  },
  pinError: {
    color: "#e74c3c",
    fontSize: 14,
    marginBottom: 16,
  },
  pinButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 12,
  },
  pinButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },

  // ─── LOADING / EMPTY ───────────────────────────────────────────
  centeredContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f4f4f8",
  },
  loadingText: {
    marginTop: 12,
    color: "#888",
    fontSize: 15,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: "#888",
  },

  // ─── HEADER ────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 14,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e8e8e8",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  headerCount: {
    fontSize: 14,
    color: "#007AFF",
    fontWeight: "600",
  },

  // ─── TOAST ─────────────────────────────────────────────────────
  toast: {
    position: "absolute",
    top: 120,
    alignSelf: "center",
    backgroundColor: "#333",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    zIndex: 100,
  },
  toastText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },

  // ─── LIST ──────────────────────────────────────────────────────
  list: {
    padding: 16,
    paddingBottom: 40,
  },

  // ─── CARD ──────────────────────────────────────────────────────
  card: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  cardBrand: {
    fontSize: 16,
    color: "#888",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cardName: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#111",
    marginBottom: 4,
  },
  cardVariant: {
    fontSize: 16,
    color: "#555",
    marginBottom: 6,
  },
  cardMeta: {
    fontSize: 16,
    color: "#007AFF",
    fontWeight: "600",
    marginBottom: 16,
    textTransform: "capitalize",
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  metaLabel: {
    fontSize: 13,
    color: "#aaa",
    width: 90,
  },
  metaValue: {
    fontSize: 13,
    color: "#555",
    flex: 1,
  },

  // ─── PHOTOS ────────────────────────────────────────────────────
  photoBlock: {
    marginTop: 18,
  },
  photoLabel: {
    fontSize: 12,
    color: "#aaa",
    marginBottom: 6,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  productPhoto: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  // Fixed-height scroll container — clips to the frame so ingredient list stays visible below
  ingredientPhotoScroll: {
    width: "100%",
    height: 250,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  ingredientPhoto: {
    width: "100%",
    height: 250,
  },

  // ─── INGREDIENTS ───────────────────────────────────────────────
  ingredientSection: {
    marginTop: 18,
    padding: 14,
    backgroundColor: "#f8f8f8",
    borderRadius: 8,
  },
  ingredientSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  ingredientInput: {
    fontSize: 15,
    color: "#444",
    lineHeight: 23,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    padding: 10,
    minHeight: 80,
    backgroundColor: "white",
    textAlignVertical: "top",
  },

  // ─── FLAGGED BANNER ────────────────────────────────────────────
  flaggedBanner: {
    backgroundColor: "#fff3cd",
    borderWidth: 1,
    borderColor: "#f0ad4e",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  flaggedBannerText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#856404",
  },

  // ─── ACTIONS ───────────────────────────────────────────────────
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 20,
  },
  approveButton: {
    flex: 1,
    backgroundColor: "#e8f8ee",
    borderWidth: 1,
    borderColor: "#27ae60",
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
  },
  approveText: {
    color: "#27ae60",
    fontWeight: "700",
    fontSize: 15,
  },
  editButton: {
    flex: 1,
    backgroundColor: "#eef4ff",
    borderWidth: 1,
    borderColor: "#4a90e2",
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
  },
  editText: {
    color: "#4a90e2",
    fontWeight: "700",
    fontSize: 15,
  },
  removeButton: {
    flex: 1,
    backgroundColor: "#fdecea",
    borderWidth: 1,
    borderColor: "#e74c3c",
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
  },
  removeText: {
    color: "#e74c3c",
    fontWeight: "700",
    fontSize: 15,
  },

  // ─── EDIT MODAL ────────────────────────────────────────────────
  modalContainer: {
    flex: 1,
    backgroundColor: "#f4f4f8",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 14,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e8e8e8",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#333",
  },
  modalCancel: {
    fontSize: 16,
    color: "#888",
  },
  modalSave: {
    fontSize: 16,
    color: "#007AFF",
    fontWeight: "600",
  },
  modalScroll: {
    padding: 20,
    paddingBottom: 40,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 10,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
    marginBottom: 4,
    marginTop: 10,
  },
  modalInput: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 11,
    fontSize: 15,
    color: "#333",
  },
  modalHint: {
    fontSize: 12,
    color: "#aaa",
    marginBottom: 8,
  },
  modalAddButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderStyle: "dashed",
    marginTop: 8,
  },
  modalAddButtonText: {
    fontSize: 14,
    color: "#888",
    fontWeight: "500",
  },
  editIngredientRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#eee",
  },
  editIngredientRowActive: {
    borderColor: "#007AFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  dragHandle: {
    paddingRight: 10,
    paddingVertical: 4,
  },
  dragHandleIcon: {
    fontSize: 18,
    color: "#ccc",
  },
  editIngredientInput: {
    flex: 1,
    fontSize: 14,
    color: "#333",
    paddingVertical: 2,
  },
  editIngredientDelete: {
    fontSize: 15,
    color: "#bbb",
    fontWeight: "600",
    paddingLeft: 8,
  },
});
