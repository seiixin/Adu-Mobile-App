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
import AsyncStorage from "@react-native-async-storage/async-storage";
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

  // how-to modal control lives here so we can decide at the moment of entering the map
  const [showHowTo, setShowHowTo] = useState(false);

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

  const HOWTO_KEY = "map_howto_hide"; // '1' = don't show again

  const goToMap = async (a) => {
    setAdvisory(a);
    try {
      const hide = await AsyncStorage.getItem(HOWTO_KEY);
      setShowHowTo(hide === "1" ? false : true);
    } catch {
      setShowHowTo(true);
    }
    setScreen("map");
  };

  const goBack = () => {
    setScreen("advisory");
    setAdvisory(null);
  };

  const persistDontShow = async () => {
    try {
      await AsyncStorage.setItem(HOWTO_KEY, "1");
    } catch {}
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
          <MapScreen
            advisory={advisory}
            onBack={goBack}
            showHowTo={showHowTo}
            onCloseHowTo={() => setShowHowTo(false)}
            onDontShowAgain={async () => {
              await persistDontShow();
              setShowHowTo(false);
            }}
          />
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
        {["Red Warning", "Orange Warning", "Yellow Warning"]
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

function MapScreen({ advisory, onBack, showHowTo, onCloseHowTo, onDontShowAgain }) {
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

  const MODAL_CLOSE_ZOOM = -10;
  const PAN_GUTTER = 140;

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  const aspect = imgMeta.w / imgMeta.h;
  const baseW = Math.max(container.w * 1.4, container.w);
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
  const stepZoom = (factor) => {
    const curS = scaleRef.current;
    const ns = clamp(curS * factor, minScale, maxScale);
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

  // Pan + Pinch
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
          const [t0, t1] = [touches[0], touches[1]];
          const dx = t1.locationX - t0.locationX;
          const dy = t1.locationY - t0.locationY;
          const curDist = Math.hypot(dx, dy);
          const ns = Math.min(Math.max((pinchRef.current.startScale || 1) * (curDist / (pinchRef.current.startDist || 1)), 1), 2);
          const focalX = (t0.locationX + t1.locationX) / 2;
          const focalY = (t0.locationY + t1.locationY) / 2;
          const wx = (focalX - (pinchRef.current.startOffset?.x ?? 0)) / (pinchRef.current.startScale || 1);
          const wy = (focalY - (pinchRef.current.startOffset?.y ?? 0)) / (pinchRef.current.startScale || 1);
          const ox = focalX - wx * ns;
          const oy = focalY - wy * ns;
          const c = clampOffsets(ox, oy, ns);
          scale.setValue(ns);
          panX.setValue(c.x);
          panY.setValue(c.y);
          scaleRef.current = ns;
          offsetRef.current = { x: c.x, y: c.y };
        } else {
          const s = scaleRef.current;
          const m = maxOffset(s);
          const nx = Math.max(Math.min(offsetRef.current.x + g.dx,  PAN_GUTTER), -m.x - PAN_GUTTER);
          const ny = Math.max(Math.min(offsetRef.current.y + g.dy,  PAN_GUTTER), -m.y - PAN_GUTTER);
          panX.setValue(nx);
          panY.setValue(ny);
        }
      },
      onPanResponderRelease: () => {
        pinchRef.current = { active: false, startDist: 0, startScale: 1, startOffset: { x: 0, y: 0 }, focal: { x: 0, y: 0 } };
        try {
          offsetRef.current = { x: panX.__getValue(), y: panY.__getValue() };
          scaleRef.current = scale.__getValue();
        } catch {}
      },
      onPanResponderTerminationRequest: () => true,
    })
  ).current;

  const sidebarX = useRef(new Animated.Value(320)).current;
  useEffect(() => {
    Animated.timing(sidebarX, { toValue: showSidebar ? 0 : 320, duration: 250, useNativeDriver: true }).start();
  }, [showSidebar]);

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
        <Text onPress={onHeaderPress} style={styles.back}>‹</Text>
        <Text style={styles.headerTitle} numberOfLines={1}>Advisory: {advisory}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable onPress={onBack}><Text style={styles.headerRight}>Change</Text></Pressable>
        </View>
      </View>

      {/* Center instruction banner (below navbar) */}
      {(isSeeking || showBanner) && (
        <View style={styles.centerHintWrap} pointerEvents="none">
          <View style={styles.centerHintCard}>
            <Image source={require("./assets/center.png")} style={{ width: 16, height: 16, marginRight: 6 }} />
            <Text style={styles.centerHintText}>After pinching or moving, tap Center (🎯) first, then tap a gate.</Text>
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

      {/* Sidebar legend hidden */}
      <Animated.View style={[styles.sidebar, { transform: [{ translateX: sidebarX }] }]} />

      {/* Bottom quick zooms */}
      <View style={styles.quickZoomWrap} pointerEvents="box-none">
        <View style={styles.qzTable}>
          <TouchableOpacity style={styles.qz} onPress={() => zoomToRegion("STOZ")}><Text style={styles.qzText}>ST/OZ Building</Text></TouchableOpacity>
          <TouchableOpacity style={styles.qz} onPress={() => zoomToRegion("CSFRC")}><Text style={styles.qzText}>CS/FRC Building</Text></TouchableOpacity>
          <TouchableOpacity style={styles.qz} onPress={() => zoomToRegion("SV")}><Text style={styles.qzText}>SV Building</Text></TouchableOpacity>
        </View>
      </View>

      {/* Zoom controls */}
      <View style={styles.zoomFabWrap} pointerEvents="box-none">
        <View style={styles.zoomFabGroup}>
          <TouchableOpacity style={styles.zoomBtn} onPress={centerConfirm} accessibilityLabel="Center view"><Text style={styles.zoomLbl}>🎯</Text></TouchableOpacity>
          <TouchableOpacity style={styles.zoomBtn} onPress={zoomIn}><Text style={styles.zoomLbl}>＋</Text></TouchableOpacity>
          <TouchableOpacity style={styles.zoomBtn} onPress={zoomOut}><Text style={styles.zoomLbl}>－</Text></TouchableOpacity>
          <TouchableOpacity style={styles.zoomBtn} onPress={resetView}><Text style={styles.zoomLbl}>⟲</Text></TouchableOpacity>
        </View>
      </View>

      {/* Gate modal */}
      <Modal transparent animationType="fade" visible={!!selected} onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{friendlyName(selected)}</Text>
            <Text style={styles.modalLabel}>Expected Flood Level</Text>
            <Text style={[styles.modalLevel, !currentLevel && { color: "#9ca3af" }]}>{currentLevel || NA_TEXT}</Text>
            {currentLevel && (
              <View style={styles.gaugeCard}>
                <Text style={styles.gaugeTitle}>Expected Flood Level</Text>
                <Image source={require("./assets/level_placeholder.png")} style={styles.gaugeImg} resizeMode="cover" />
              </View>
            )}
            <Pressable style={styles.closeBtn} onPress={() => { zoomToPoint(selected); setSelected(null); }}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* HOW-TO MODAL: shows every entry unless "don't show again" */}
      <HowToModal
        visible={!!showHowTo}
        onClose={onCloseHowTo}
        onDontShowAgain={onDontShowAgain}
      />
    </SafeAreaView>
  );
}

/* ------------------------------ HowTo Modal ----------------------------- */

function HowToModal({ visible, onClose, onDontShowAgain }) {
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    if (!visible) setDontShow(false);
  }, [visible]);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.howtoBg}>
        <View style={styles.howtoCard}>
          <Text style={styles.howtoTitle}>How to use the map</Text>
          <View style={{ marginTop: 8, gap: 6 }}>
            <Bullet>Click a <Text style={{ fontWeight: "800" }}>gate label</Text> on the map to view flood info.</Bullet>
            <Bullet>Or tap a <Text style={{ fontWeight: "800" }}>Building group</Text> below to zoom to that area.</Bullet>
            <Bullet>Drag to pan • Use mouse wheel / pinch to zoom.</Bullet>
          </View>

          <View style={styles.howtoRow}>
            <Pressable onPress={() => setDontShow((v) => !v)} style={styles.chkBoxWrap}>
              <View style={[styles.chkBox, dontShow && styles.chkBoxChecked]}>
                {dontShow && <Text style={styles.chkTick}>✓</Text>}
              </View>
              <Text style={styles.howtoChkText}>Don’t show again</Text>
            </Pressable>

            <Pressable
              style={styles.howtoCta}
              onPress={() => {
                if (dontShow) onDontShowAgain?.();
                else onClose?.();
              }}
            >
              <Text style={styles.howtoCtaText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Bullet({ children }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
      <Text style={{ fontSize: 16, lineHeight: 22 }}>•</Text>
      <Text style={{ flex: 1, fontSize: 14, color: "#111", lineHeight: 20 }}>{children}</Text>
    </View>
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

  sidebar: { display: "none" },

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

  quickZoomWrap: { position: "absolute", left: 0, right: 0, bottom: 24, alignItems: "center" },
  qzTable: { backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 12, padding: 8, gap: 8, width: "72%" },
  qz: { backgroundColor: "#f2f2f2", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  qzText: { color: "#111", fontWeight: "700" },

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

  gaugeCard: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  gaugeTitle: { color: "#111", fontWeight: "700", marginBottom: 6 },
  gaugeImg: { width: "100%", height: 300, borderRadius: 8, backgroundColor: "#f0f0f0" },

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

  /* How-to modal styles */
  howtoBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  howtoCard: {
    width: "86%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  howtoTitle: { fontSize: 17, fontWeight: "800", color: "#111", marginBottom: 4 },
  howtoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14 },
  chkBoxWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  chkBox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: "#444", alignItems: "center", justifyContent: "center" },
  chkBoxChecked: { backgroundColor: "#111" },
  chkTick: { color: "#fff", fontSize: 12, lineHeight: 14, fontWeight: "800" },
  howtoChkText: { color: "#111", fontSize: 13, fontWeight: "600" },
  howtoCta: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "#111", borderRadius: 8 },
  howtoCtaText: { color: "#fff", fontWeight: "800" },
});
