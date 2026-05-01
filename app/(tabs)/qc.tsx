import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
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
  product_ingredients: Ingredient[];
  ingredientPhotoUrl: string | null;
}

export default function QCScreen() {
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);

  const [products, setProducts] = useState<PendingProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
          .eq("qc_status", "pending")
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
      const { error } = await supabase
        .from("products")
        .update({ qc_status: "approved" })
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

  // ─── REJECT ───────────────────────────────────────────────────
  const handleReject = (productId: string) => {
    Alert.alert(
      "Are you sure?",
      "This will mark the product as rejected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("products")
                .update({ qc_status: "rejected" })
                .eq("id", productId);
              if (error) {
                Alert.alert("Error", error.message);
                return;
              }
              setProducts(prev => prev.filter(p => p.id !== productId));
              showToast("Rejected ❌");
            } catch (e) {
              Alert.alert("Connection error", "Could not reject product. Please check your internet connection.");
              console.warn("[qc] handleReject threw:", e);
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

      {/* Toast */}
      {toast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.list}>
        {products.map(product => {
          const ingredients = [...(product.product_ingredients ?? [])]
            .sort((a, b) => a.position - b.position);
          const ingredientPhotoUrl = product.ingredientPhotoUrl;
          const date = new Date(product.created_at).toLocaleDateString("en-GB", {
            day: "numeric", month: "short", year: "numeric",
          });

          return (
            <View key={product.id} style={styles.card}>
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

              {/* Photos */}
              <View style={styles.photoRow}>
                {product.product_image_url ? (
                  <View style={styles.photoBlock}>
                    <Text style={styles.photoLabel}>Product</Text>
                    <Image
                      source={{ uri: product.product_image_url }}
                      style={styles.photo}
                      resizeMode="cover"
                    />
                  </View>
                ) : null}
                {ingredientPhotoUrl ? (
                  <View style={styles.photoBlock}>
                    <Text style={styles.photoLabel}>Ingredients</Text>
                    <Image
                      source={{ uri: ingredientPhotoUrl }}
                      style={styles.photo}
                      resizeMode="cover"
                    />
                  </View>
                ) : null}
              </View>

              {/* Ingredient list */}
              {ingredients.length > 0 && (
                <View style={styles.ingredientSection}>
                  <Text style={styles.ingredientSectionTitle}>
                    Ingredients ({ingredients.length})
                  </Text>
                  <Text style={styles.ingredientList}>
                    {ingredients.map(i => i.ingredient_name).join(", ")}
                  </Text>
                </View>
              )}

              {/* Actions */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.approveButton}
                  onPress={() => handleApprove(product.id)}
                >
                  <Text style={styles.approveText}>✅ Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectButton}
                  onPress={() => handleReject(product.id)}
                >
                  <Text style={styles.rejectText}>❌ Reject</Text>
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
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  cardBrand: {
    fontSize: 13,
    color: "#888",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  cardName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#111",
    marginBottom: 2,
  },
  cardVariant: {
    fontSize: 14,
    color: "#555",
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: 13,
    color: "#007AFF",
    fontWeight: "600",
    marginBottom: 12,
    textTransform: "capitalize",
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  metaLabel: {
    fontSize: 12,
    color: "#aaa",
    width: 80,
  },
  metaValue: {
    fontSize: 12,
    color: "#555",
    flex: 1,
  },

  // ─── PHOTOS ────────────────────────────────────────────────────
  photoRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    marginBottom: 4,
  },
  photoBlock: {
    flex: 1,
  },
  photoLabel: {
    fontSize: 11,
    color: "#aaa",
    marginBottom: 4,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  photo: {
    width: "100%",
    height: 130,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },

  // ─── INGREDIENTS ───────────────────────────────────────────────
  ingredientSection: {
    marginTop: 14,
    padding: 12,
    backgroundColor: "#f8f8f8",
    borderRadius: 8,
  },
  ingredientSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  ingredientList: {
    fontSize: 13,
    color: "#444",
    lineHeight: 20,
  },

  // ─── ACTIONS ───────────────────────────────────────────────────
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  approveButton: {
    flex: 1,
    backgroundColor: "#e8f8ee",
    borderWidth: 1,
    borderColor: "#27ae60",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  approveText: {
    color: "#27ae60",
    fontWeight: "700",
    fontSize: 15,
  },
  rejectButton: {
    flex: 1,
    backgroundColor: "#fdecea",
    borderWidth: 1,
    borderColor: "#e74c3c",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  rejectText: {
    color: "#e74c3c",
    fontWeight: "700",
    fontSize: 15,
  },
});
