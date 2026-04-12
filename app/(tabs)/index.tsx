import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { Button, StyleSheet, Text, Vibration, View } from "react-native";
import { supabase } from "../../lib/supabase";

export default function HomeScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const lastScan = useRef<{barcode: string, time: number} | null>(null);

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
    const now = Date.now();
    
    // If same barcode scanned within 3 seconds, ignore completely
    if (
      lastScan.current &&
      lastScan.current.barcode === data &&
      now - lastScan.current.time < 3000
    ) {
      return;
    }

    lastScan.current = { barcode: data, time: now };
    setScanned(true);
    setResult(data);

    // Vibrate and flash to confirm scan
    Vibration.vibrate(100);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    const { error } = await supabase
      .from("scans")
      .insert([{ barcode: data }]);

    if (error) {
      console.error("Error saving scan:", error);
    } else {
      console.log("Scan saved!", data);
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

      {/* Targeting box overlay */}
      <View style={styles.overlay}>
        <View style={styles.topOverlay} />
        <View style={styles.middleRow}>
          <View style={styles.sideOverlay} />
          <View style={[styles.targetBox, flash && styles.targetBoxFlash]}>
            {/* Corner markers */}
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
          <View style={styles.sideOverlay} />
        </View>
        <View style={styles.bottomOverlay}>
          {scanned ? (
            <View style={styles.result}>
              <Text style={styles.resultText}>✅ Scanned: {result}</Text>
              <Button title="Scan Again" onPress={() => {
                setScanned(false);
              }} />
            </View>
          ) : (
            <Text style={styles.instructionText}>
              Position barcode inside the box
            </Text>
          )}
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
  },
  instructionText: {
    color: "white",
    fontSize: 16,
    textAlign: "center",
  },
  result: {
    alignItems: "center",
  },
  resultText: {
    color: "white",
    fontSize: 18,
    marginBottom: 15,
    textAlign: "center",
  },
});