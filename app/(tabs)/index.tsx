import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import { supabase } from "../../lib/supabase";

export default function HomeScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const isProcessing = useRef(false);

  if (!permission) {
    return <Text>Loading...</Text>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={{textAlign:"center", margin: 20}}>
          We need camera permission to scan barcodes
        </Text>
        <Button title="Allow Camera" onPress={() => requestPermission()} />
      </View>
    );
  }

  const handleBarcodeScan = async ({ data }: { data: string }) => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    setScanned(true);
    setResult(data);

    const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
    
    const { data: recentScans } = await supabase
      .from("scans")
      .select("id")
      .eq("barcode", data)
      .gte("created_at", fiveSecondsAgo);

    if (recentScans && recentScans.length === 0) {
      const { error } = await supabase
        .from("scans")
        .insert([{ barcode: data }]);

      if (error && error.code !== '23505') {
      console.error("Error saving scan:", error);
    } else {
      console.log("Scan saved or duplicate ignored");
    }
      }
    } else {
      console.log("Duplicate scan ignored");
    }
  };

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScan}
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
        }}
      />
      {scanned && (
        <View style={styles.result}>
          <Text style={styles.resultText}>Barcode: {result}</Text>
          <Button title="Scan Again" onPress={() => {
            setScanned(false);
            isProcessing.current = false;
          }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  result: {
    position: "absolute",
    bottom: 80,
    width: "100%",
    backgroundColor: "white",
    padding: 20,
    alignItems: "center",
  },
  resultText: {
    fontSize: 18,
    marginBottom: 10,
  },
});