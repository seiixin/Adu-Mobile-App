// App.js

function shortLabelFromId(id) {
  const parts = id.split("-");
  if (parts.length === 2) return parts[0] + " - " + parts[1];
  return id.replace("-", " - ");
}

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  ImageBackground,
  Modal,
  StyleSheet,
  Dimensions,
  Animated,
  StatusBar,
  PanResponder,
  ScrollView,
  TouchableWithoutFeedback,
  TouchableOpacity,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ADVISORIES, POINTS, ZONES, LEVELS, ADVISORY_COLORS } from "./src/config";

/* ------------------------------ Constants ------------------------------ */

const { width: W, height: H } = Dimensions.get("window");
const BUILD = "PATCH6_FULL_WHITE";

// Fallback text when a gate has no data for the current advisory
const NA_TEXT = "Not available in this Rainfall Advisory";

const REGION_CENTERS = {
  SV: { x: 0.150, y: 0.6 },
  STOZ: { x: -0.265, y: -10 },
  CSFRC: { x: 0.525, y: 0.600 },
};

const FRIENDLY_GATE_NAMES = {
  "ST-2": "ST Gate",
  "ST-10": "OZ Gate",
  "CS-2": "CS Gate",
  "CS-3": "Meralco Gate",
  "CS-8": "BED Gate",
  "SV-10": "SVP Church Gate",
  "SV-6": "SV Gate",
};

const friendlyName = (pt) =>
  (pt && (FRIENDLY_GATE_NAMES[pt.id] || pt.name || shortLabelFromId(pt.id))) || "";

// rough mapping just for the gauge subtitle
const levelToMeters = (label = "") => {
  const L = (label || "").toLowerCase();
  if (L.includes("ankle")) return 0.2;
  if (L.includes("knee")) return 0.5;
  if (L.includes("waist")) return 1.0;
  if (L.includes("chest")) return 1.5;
  if (L.includes("gutter")) return 0.25;
  if (L.includes("half-tire")) return 0.3;
  return 0.4;
};

/* --------------------------------  App  -------------------------------- */

export default function App() {
  return (
    <SafeAreaProvider>
      <InnerApp />
    </SafeAreaProvider>
  );
}

function InnerApp() {
  const [screen, setScreen] = useState("advisory");
  const [advisory, setAdvisory] = useState(null);
  const [showSplash, setShowSplash] = useState(true);

  const fade = useRef(new Animated.Value(0)).current;
  const splashOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(splashOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(350),
      Animated.timing(splashOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setShowSplash(false));
  }, []);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [screen]);

  const goToMap = (a) => {
    setAdvisory(a);
    setScreen("map");
  };
  const goBack = () => {
    setScreen("advisory");
    setAdvisory(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <StatusBar barStyle="dark-content" />
      {screen === "advisory" ? (
        <Animated.View style={{ flex: 1, opacity: fade }}>
          <AdvisoryScreen onPick={goToMap} />
        </Animated.View>
      ) : (
        <Animated.View style={{ flex: 1, opacity: fade }}>
          <MapScreen advisory={advisory} onBack={goBack} />
        </Animated.View>
      )}

      {showSplash && (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.splash, { opacity: splashOpacity }]}
        >
          <Image source={require("./assets/seal.png")} style={styles.splashLogo} resizeMode="contain" />
          <Text style={styles.splashTitle}>Adamson University</Text>
          <Text style={styles.splashSub}>Campus Flood Demo • {BUILD}</Text>
        </Animated.View>
      )}
    </View>
  );
}

/* ---------------------------- Advisory Screen --------------------------- */

function AdvisoryScreen({ onPick }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.brand}>
        <Image source={require("./assets/seal.png")} style={styles.brandLogo} resizeMode="contain" />
        <View style={{ flex: 1 }}>
          <Text style={styles.brandTitle}>Adamson University</Text>
          <Text style={styles.brandSub}>Rainfall Advisory</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Select the current Rainfall Advisory from NDRRMC</Text>

      <View style={styles.cardList}>
        {/* Ordered UI only: Red → Yellow → Orange (keeps your data intact) */}
        {["Red Warning", "Yellow Warning", "Orange Warning"]
          .filter((lbl) => ADVISORIES.includes(lbl))
          .map((a) => (
            <Pressable
              key={a}
              onPress={() => onPick(a)}
              style={[styles.card, { borderColor: ADVISORY_COLORS[a] }]}
            >
              <View style={[styles.colorDot, { backgroundColor: ADVISORY_COLORS[a] }]} />
              <Text style={styles.cardText}>{a}</Text>
            </Pressable>
          ))}
      </View>
    </SafeAreaView>
  );
}

/* ------------------------------ Map Screen ------------------------------ */

function MapScreen({ advisory, onBack }) {
  const headerColor = ADVISORY_COLORS[advisory] || "#888";

  const [selected, setSelected] = useState(null);
  const [imgMeta, setImgMeta] = useState({ w: 2048, h: 1536 });
  const [container, setContainer] = useState({ w: W, h: H });
  const [showSidebar, setShowSidebar] = useState(false);
  const [debug, setDebug] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  // programmatic zoom + pan
  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const pinchRef = useRef({
    active: false,
    startDist: 0,
    startScale: 1,
    startOffset: { x: 0, y: 0 },
    focal: { x: 0, y: 0 },
  });

  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });

  const minScale = 1;
  const maxScale = 2;

  // --- tuning ----
  const MODAL_CLOSE_ZOOM = -10; // clamped anyway
  const PAN_GUTTER = 140; // px whitespace allowed beyond edges

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  const aspect = imgMeta.w / imgMeta.h;
  const baseW = Math.max(container.w * 1.4, container.w); // width at scale=1
  const baseH = baseW / aspect;

  const maxOffset = (s) => ({
    x: Math.max(0, baseW * s - container.w),
    y: Math.max(0, baseH * s - container.h + 140),
  });

  const clampOffsets = (ox, oy, s) => {
    const m = maxOffset(s);
    const minX = -m.x - PAN_GUTTER,
      maxX = PAN_GUTTER;
    const minY = -m.y - PAN_GUTTER,
      maxY = PAN_GUTTER;
    return { x: clamp(ox, minX, maxX), y: clamp(oy, minY, maxY) };
  };

  const commit = (s, x, y, animate = true) => {
    const c = clampOffsets(x, y, s);
    scaleRef.current = s;
    offsetRef.current = { x: c.x, y: c.y };
    const anim = (val, to) => Animated.timing(val, { toValue: to, duration: 250, useNativeDriver: true });
    if (animate) {
      Animated.parallel([anim(scale, s), anim(panX, c.x), anim(panY, c.y)]).start();
    } else {
      scale.setValue(s);
      panX.setValue(c.x);
      panY.setValue(c.y);
    }
  };

  const zoomToRegion = (id) => {
    const r = REGION_CENTERS[id];
    if (!r) return;
    const curS = scaleRef.current;
    const ns = clamp(Math.max(1.8, curS * 1.3), minScale, maxScale);
    const cx = r.x * baseW * ns,
      cy = r.y * baseH * ns;
    const ox = container.w / 2 - cx,
      oy = container.h / 2 - cy;
    const c = clampOffsets(ox, oy, ns);
    commit(ns, c.x, c.y, true);
  };

  const zoomToPoint = (pt, desired = MODAL_CLOSE_ZOOM) => {
    if (!pt) return;
    const target = typeof pt.zoom === "number" ? pt.zoom : desired;
    const ns = clamp(target, minScale, maxScale);

    // use zoom_coordinates if provided, otherwise the point's own x/y
    const zx =
      pt.zoom_coordinates && typeof pt.zoom_coordinates.x === "number" ? pt.zoom_coordinates.x : pt.x;
    const zy =
      pt.zoom_coordinates && typeof pt.zoom_coordinates.y === "number" ? pt.zoom_coordinates.y : pt.y;

    const cx = zx * baseW * ns,
      cy = zy * baseH * ns;
    const ox = container.w / 2 - cx,
      oy = container.h / 2 - cy;
    const c = clampOffsets(ox, oy, ns);
    commit(ns, c.x, c.y, true);
  };

  // +/-/reset
  const stepZoom = (factor) => {
    const curS = scaleRef.current;
    const ns = clamp(curS * factor, minScale, maxScale);
    // keep current screen center anchored during zoom
    const centerX = (container.w / 2 - offsetRef.current.x) / curS;
    const centerY = (container.h / 2 - offsetRef.current.y) / curS;
    const ox = container.w / 2 - centerX * ns;
    const oy = container.h / 2 - centerY * ns;
    const c = clampOffsets(ox, oy, ns);
    commit(ns, c.x, c.y, true);
  };
  const zoomIn = () => stepZoom(1.15);
  const zoomOut = () => stepZoom(1 / 1.15);
  const resetView = () => commit(1, 0, 0, true);
  function centerConfirm() {
    setIsSeeking(false);
    commit(scaleRef.current, offsetRef.current.x, offsetRef.current.y, false);
  }

  const source = require("./assets/campus_map.png");
  useEffect(() => {
    const meta = Image.resolveAssetSource(source) || {};
    if (meta.width && meta.height) setImgMeta({ w: meta.width, h: meta.height });
  }, []);

  // Pan + Pinch gesture
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt, g) => false,
      onMoveShouldSetPanResponder: (evt, g) =>
        g.numberActiveTouches >= 2 || Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderGrant: (evt, g) => {
        setIsSeeking(true);
        setShowBanner(true);
        setTimeout(() => setShowBanner(false), 1600);
        const touches = evt.nativeEvent.touches || [];
        if (touches.length >= 2) {
          pinchRef.current.active = true;
          pinchRef.current.startScale = scaleRef.current;
          pinchRef.current.startOffset = { ...offsetRef.current };
          const [t0, t1] = [touches[0], touches[1]];
          const dx = t1.locationX - t0.locationX;
          const dy = t1.locationY - t0.locationY;
          pinchRef.current.startDist = Math.hypot(dx, dy);
          pinchRef.current.focal = { x: (t0.locationX + t1.locationX) / 2, y: (t0.locationY + t1.locationY) / 2 };
        } else {
          pinchRef.current.active = false;
        }
      },
      onPanResponderMove: (evt, g) => {
        const touches = evt.nativeEvent.touches || [];
        if (touches.length >= 2 && pinchRef.current.startDist) {
          // pinch-zoom
          const [t0, t1] = [touches[0], touches[1]];
          const dx = t1.locationX - t0.locationX;
          const dy = t1.locationY - t0.locationY;
          const curDist = Math.hypot(dx, dy);
          const ns = clamp(
            (pinchRef.current.startScale || 1) * (curDist / (pinchRef.current.startDist || 1)),
            minScale,
            maxScale
          );
          const focalX = (t0.locationX + t1.locationX) / 2;
          const focalY = (t0.locationY + t1.locationY) / 2;
          // world coords at start focal
          const wx = (focalX - (pinchRef.current.startOffset?.x ?? 0)) / (pinchRef.current.startScale || 1);
          const wy = (focalY - (pinchRef.current.startOffset?.y ?? 0)) / (pinchRef.current.startScale || 1);
          // keep focal steady
          const ox = focalX - wx * ns;
          const oy = focalY - wy * ns;
          const c = clampOffsets(ox, oy, ns);
          scale.setValue(ns);
          panX.setValue(c.x);
          panY.setValue(c.y);
          scaleRef.current = ns;
          offsetRef.current = { x: c.x, y: c.y };
        } else {
          // single-finger pan
          const s = scaleRef.current;
          const m = maxOffset(s);
          const nx = clamp(offsetRef.current.x + g.dx, -m.x - PAN_GUTTER, PAN_GUTTER);
          const ny = clamp(offsetRef.current.y + g.dy, -m.y - PAN_GUTTER, PAN_GUTTER);
          panX.setValue(nx);
          panY.setValue(ny);
        }
      },
      onPanResponderRelease: (evt, g) => {
        // keep seeking true; user must hit Center to confirm
        pinchRef.current = {
          active: false,
          startDist: 0,
          startScale: 1,
          startOffset: { x: 0, y: 0 },
          focal: { x: 0, y: 0 },
        };
        // snap current values into refs
        try {
          offsetRef.current = { x: panX.__getValue(), y: panY.__getValue() };
          scaleRef.current = scale.__getValue();
        } catch (e) {}
      },
      onPanResponderTerminationRequest: () => true,
    })
  ).current;

  // legend slide (kept but hidden in styles)
  const sidebarX = useRef(new Animated.Value(320)).current;
  useEffect(() => {
    Animated.timing(sidebarX, { toValue: showSidebar ? 0 : 320, duration: 250, useNativeDriver: true }).start();
  }, [showSidebar]);

  // DEBUG coordinate picker (triple-tap header)
  const [dbgTap, setDbgTap] = useState(0);
  const dbgTimer = useRef(null);
  const onHeaderPress = () => {
    setDbgTap((c) => {
      const n = c + 1;
      if (dbgTimer.current) clearTimeout(dbgTimer.current);
      dbgTimer.current = setTimeout(() => setDbgTap(0), 400);
      if (n >= 3) {
        setDebug((v) => !v);
        return 0;
      }
      return n;
    });
  };

  // NEW: return null when no data (modal will show NA_TEXT)
  const levelFor = (id) => {
    const v = LEVELS?.[advisory]?.[id];
    return (typeof v === "string" && v.trim()) ? v : null;
  };

  const onImagePress = (e) => {
    if (!debug) return;
    const { locationX, locationY } = e.nativeEvent;
    const s = scaleRef.current;
    const nx = Math.max(0, Math.min(1, locationX / (baseW * s)));
    const ny = Math.max(0, Math.min(1, locationY / (baseH * s)));
    console.log("[coord]", { x: +nx.toFixed(4), y: +ny.toFixed(4) });
  };

  const currentLevel = selected ? levelFor(selected.id) : null;

  return (
    <SafeAreaView
      style={styles.screen}
      onLayout={(e) => setContainer({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: headerColor }]}>
        <Text onPress={onHeaderPress} style={styles.back}>
          ‹
        </Text>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Advisory: {advisory}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {/* Legend/Close removed as requested */}
          <Pressable onPress={onBack}>
            <Text style={styles.headerRight}>Change</Text>
          </Pressable>
        </View>
      </View>

      {/* Center instruction banner (below navbar) */}
      {(isSeeking || showBanner) && (
        <View style={styles.centerHintWrap} pointerEvents="none">
          <View style={styles.centerHintCard}>
            <Image source={require("./assets/center.png")} style={{ width: 16, height: 16, marginRight: 6 }} />
            <Text style={styles.centerHintText}>
              After pinching or moving, tap Center (🎯) first, then tap a gate.
            </Text>
          </View>
        </View>
      )}

      {/* Map */}
      <View style={styles.mapArea}>
        <Animated.View
          {...responder.panHandlers}
          style={[
            styles.panWrap,
            { width: baseW, height: baseH, transform: [{ translateX: panX }, { translateY: panY }, { scale }] },
          ]}
        >
          <TouchableWithoutFeedback onPress={onImagePress}>
            <ImageBackground source={require("./assets/campus_map.png")} style={{ width: baseW, height: baseH }} imageStyle={{ resizeMode: "cover" }}>
              <View style={StyleSheet.absoluteFill}>
                {ZONES.map((z) => (
                  <View key={z.id} style={[styles.zoneTag, { left: z.x * baseW - 18, top: z.y * baseH - 10 }]}>
                    <Text style={styles.zoneTagText}>{z.title}</Text>
                  </View>
                ))}
                {POINTS.map((p) => (
                  <Pressable
                    key={p.id}
                    delayLongPress={110}
                    onLongPress={() => {
                      if (isSeeking) {
                        setShowBanner(true);
                        setTimeout(() => setShowBanner(false), 1200);
                        return;
                      }
                      zoomToPoint(p);
                      setSelected(p);
                    }}
                    onPress={() => {
                      if (isSeeking) {
                        setShowBanner(true);
                        setTimeout(() => setShowBanner(false), 1200);
                        return;
                      }
                      setSelected(p);
                    }}
                    style={[
                      styles.hitbox,
                      { left: p.x * baseW - 28, top: p.y * baseH - 22, borderColor: ringColor(levelFor(p.id)) },
                    ]}
                  >
                    <Text style={styles.hitboxText}>{friendlyName(p)}</Text>
                  </Pressable>
                ))}
              </View>
            </ImageBackground>
          </TouchableWithoutFeedback>
        </Animated.View>
      </View>

      {/* Sidebar legend (hidden via styles) */}
      <Animated.View style={[styles.sidebar, { transform: [{ translateX: sidebarX }] }]}>
        <Image source={require("./assets/legend_header.png")} style={styles.legendHeaderImg} resizeMode="contain" />
        <ScrollView contentContainerStyle={styles.legendScroll}>{/* content kept for future use */}</ScrollView>
      </Animated.View>

      {/* Bottom quick zooms */}
      <View style={styles.quickZoomWrap} pointerEvents="box-none">
        <View style={styles.qzTable}>
          <TouchableOpacity style={styles.qz} onPress={() => zoomToRegion("STOZ")}>
            <Text style={styles.qzText}>ST/OZ Building</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.qz} onPress={() => zoomToRegion("CSFRC")}>
            <Text style={styles.qzText}>CS/FRC Building</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.qz} onPress={() => zoomToRegion("SV")}>
            <Text style={styles.qzText}>SV Building</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Zoom controls */}
      <View style={styles.zoomFabWrap} pointerEvents="box-none">
        <View style={styles.zoomFabGroup}>
          <TouchableOpacity style={styles.zoomBtn} onPress={centerConfirm} accessibilityLabel="Center view">
            <Text style={styles.zoomLbl}>🎯</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomBtn} onPress={zoomIn}>
            <Text style={styles.zoomLbl}>＋</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomBtn} onPress={zoomOut}>
            <Text style={styles.zoomLbl}>－</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomBtn} onPress={resetView}>
            <Text style={styles.zoomLbl}>⟲</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal */}
      <Modal transparent animationType="fade" visible={!!selected} onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{friendlyName(selected)}</Text>
            <Text style={styles.modalLabel}>Expected Flood Level</Text>

            {/* Use NA_TEXT when missing */}
            <Text style={[styles.modalLevel, !currentLevel && { color: "#9ca3af" }]}>
              {currentLevel || NA_TEXT}
            </Text>

            {/* Only show chart/placeholder if level exists */}
            {currentLevel && (
              <View style={styles.gaugeCard}>
                <Text style={styles.gaugeTitle}>Expected Flood Level</Text>
                {/* Image placeholder for the chart */}
                <Image source={require("./assets/level_placeholder.png")} style={styles.gaugeImg} resizeMode="cover" />
              </View>
            )}

            <Pressable
              style={styles.closeBtn}
              onPress={() => {
                zoomToPoint(selected);
                setSelected(null);
              }}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ------------------------------ Utilities ------------------------------- */

function ringColor(level) {
  switch (level) {
    case "Knee-level":
      return "#4CAF50";
    case "Gutter-deep":
      return "#FFC107";
    case "Half-tire":
      return "#F44336";
    default:
      return "#9E9E9E";
  }
}

/* -------------------------------- Styles -------------------------------- */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },

  splash: { alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  splashLogo: { width: W * 0.3, height: W * 0.3, marginBottom: 8 },
  splashTitle: { color: "#111", fontSize: 20, fontWeight: "800" },
  splashSub: { color: "#666", marginTop: 2 },

  brand: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, paddingTop: 24 },
  brandLogo: { width: 56, height: 56 },
  brandTitle: { color: "#111", fontSize: 18, fontWeight: "800" },
  brandSub: { color: "#6b7280" },
  sectionTitle: { color: "#111", fontSize: 16, fontWeight: "700", paddingHorizontal: 16, marginTop: 10 },

  cardList: { padding: 16, gap: 12 },
  card: {
    padding: 16,
    borderWidth: 2,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fafafa",
  },
  cardText: { color: "#111", fontSize: 18, fontWeight: "700" },
  colorDot: { width: 16, height: 16, borderRadius: 8 },
  note: { color: "#6b7280", paddingHorizontal: 16, marginTop: 8 },
  code: { fontWeight: "800", color: "#111" },

  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  back: { color: "#000", fontWeight: "800", fontSize: 18 },
  headerTitle: { color: "#000", fontSize: 16, fontWeight: "800", maxWidth: W * 0.5 },
  headerRight: { color: "#000", fontWeight: "800" },

  mapArea: { flex: 1, overflow: "hidden", backgroundColor: "#fff" },
  panWrap: { position: "absolute", left: 0, top: 0 },

  zoneTag: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  zoneTagText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  hitbox: {
    position: "absolute",
    minWidth: 56,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
  },
  hitboxText: { fontSize: 12, fontWeight: "800", color: "#111", textAlign: "center" },

  // Hide the legend completely (keep structure for easy re-enable)
  sidebar: { display: "none" },
  legendHeaderImg: { width: "100%", height: 60, marginTop: 6 },
  legendScroll: { paddingBottom: 24, paddingHorizontal: 12 },
  legendGroupTitle: { color: "#111", fontWeight: "800", marginTop: 6 },
  legendItem: { color: "#374151", marginTop: 4, fontSize: 12 },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  modalCard: { width: "85%", backgroundColor: "#fff", borderRadius: 14, padding: 18, gap: 8 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#111" },
  modalLabel: { fontSize: 13, color: "#666" },
  modalLevel: { fontSize: 22, fontWeight: "800", marginTop: 6, color: "#111" },

  closeBtn: {
    alignSelf: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#111",
    borderRadius: 8,
    marginTop: 8,
  },
  closeBtnText: { color: "#fff", fontWeight: "700" },

  // Quick-zoom controls
  quickZoomWrap: { position: "absolute", left: 0, right: 0, bottom: 24, alignItems: "center" },
  qzTable: { backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 12, padding: 8, gap: 8, width: "72%" },
  qz: { backgroundColor: "#f2f2f2", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  qzText: { color: "#111", fontWeight: "700" },

  // Zoom FABs
  zoomFabWrap: { position: "absolute", right: 16, bottom: 24 },
  zoomFabGroup: { gap: 10 },
  zoomBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  zoomLbl: { fontSize: 20, fontWeight: "800", color: "#111" },

  // Modal gauge (kept styles; chart replaced by image placeholder)
  gaugeCard: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  gaugeTitle: { color: "#111", fontWeight: "700", marginBottom: 6 },
  gaugeChart: {
    height: 120,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  gaugeBar: { position: "absolute", height: 18, borderRadius: 9, left: 16, right: 16, bottom: 28, backgroundColor: "#43a047" },
  gaugeMarker: { position: "absolute", bottom: 28, alignItems: "center" },
  gaugeDot: { width: 18, height: 18, backgroundColor: "#43a047", borderRadius: 9, position: "absolute", left: -9, bottom: 0 },
  gaugeStick: { width: 2, height: 60, backgroundColor: "#43a047", position: "absolute", left: 0, top: -60 },
  gaugeMeters: { position: "absolute", top: -76, left: -22, color: "#43a047", fontSize: 12, fontWeight: "700" },
  gaugeLabel: { position: "absolute", bottom: 60, fontSize: 22, fontWeight: "700", color: "#111" },

  // Placeholder image style for chart
  gaugeImg: { width: "100%", height: 300, borderRadius: 8, backgroundColor: "#f0f0f0" },

  // Banner styles (below navbar)
  centerHintWrap: { position: "absolute", left: 0, right: 0, top: 100, alignItems: "center", zIndex: 10 },
  centerHintCard: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "92%",
  },
  centerHintText: { color: "#111", fontSize: 12, fontWeight: "600" },
});
