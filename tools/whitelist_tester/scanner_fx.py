"""Look and motion of the Whitelist Scanner (09.11.2026, Stan): the Fruity Nest feel.

Everything here only changes how the program looks and moves, never what it does:
  HoverFx       - every plain button / combo box / number box fades its colours on hover
  NavTabs       - the header pages: the orange line glides to the chosen page
  TabLine       - the same gliding line under a QTabWidget
  ToggleBox     - a QCheckBox drawn as a small toggle (same API as QCheckBox)
  DragSpinBox / DragDoubleSpinBox - number boxes without arrows: drag up / down or type
  RowDelegate   - table rows: hover fill fades in and out, selected row gets an orange mark,
                  cells marked HOVER_ONLY show only on the row under the mouse
  reveal_tree / reveal_widgets - rows fly in from the right (OutExpo, small stagger)
  fade_switch   - page change cross-fades instead of a hard cut
  Footer        - the hint line at the bottom: the tip of what is under the mouse,
                  or the help of the page when nothing is
  EmptyHint     - centred grey text over an empty table
Colours and timings follow the Fruity Nest UI style guide (Script Manager).
"""
from PyQt6 import QtCore, QtGui, QtWidgets

BG_HEADER = "#252E33"
BG_CONTENT = "#485259"
BG_RAIL = "#2d373e"
BG_INPUT = "#323b42"
BORDER = "#4A5057"
BORDER_DARK = "#12181D"
PANEL = "#252E33"
ROW_HOVER = "#313c44"
ROW_SEL = "#36424a"
TEXT_WHITE = "#ffffff"
TEXT_ROW = "#d8dde1"
TEXT_GRAY = "#8a9299"
TEXT_WARM = "#B8A082"
ACCENT = "#E67E22"
GREEN = "#7ED957"
RED = "#ff6b6b"
DARK_TEXT = "#14191d"

ANIM_MS = 420
HOVER_IN_MS = 160
HOVER_OUT_MS = 240
STEP_CAP_MS = 34          # frame clock: a busy frame never jumps the animation more than this

HOVER_ONLY = int(QtCore.Qt.ItemDataRole.UserRole) + 40   # item data: show this cell only on hover


def ease_out_expo(t):
    if t >= 1.0:
        return 1.0
    if t <= 0.0:
        return 0.0
    return 1.0 - 2.0 ** (-10.0 * t)


def ease_out_cubic(t):
    t = max(0.0, min(1.0, t))
    return 1.0 - (1.0 - t) ** 3


def lerp(c1, c2, t):
    c1, c2 = QtGui.QColor(c1), QtGui.QColor(c2)
    return QtGui.QColor(int(c1.red() + (c2.red() - c1.red()) * t),
                        int(c1.green() + (c2.green() - c1.green()) * t),
                        int(c1.blue() + (c2.blue() - c1.blue()) * t),
                        int(c1.alpha() + (c2.alpha() - c1.alpha()) * t))


def _rgba(c):
    c = QtGui.QColor(c)
    return "rgba(%d,%d,%d,%d)" % (c.red(), c.green(), c.blue(), c.alpha())


class FrameClock(QtCore.QObject):
    """One 16 ms timer for an animation; elapsed time grows by drawn frames with a cap,
    so a busy GUI thread does not make the first frame land at the end of the path."""
    tick = QtCore.pyqtSignal(float)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.ms = 0.0
        self._last = None
        self._tm = QtCore.QTimer(self)
        self._tm.setInterval(16)
        self._tm.timeout.connect(self._step)
        self._el = QtCore.QElapsedTimer()

    def start(self):
        self.ms = 0.0
        self._el.start()
        self._last = 0
        self._tm.start()

    def stop(self):
        self._tm.stop()

    def active(self):
        return self._tm.isActive()

    def _step(self):
        now = self._el.elapsed()
        self.ms += min(STEP_CAP_MS, max(0, now - self._last))
        self._last = now
        self.tick.emit(self.ms)


# ------------------------------------------------------------------ hover fades
# objectName -> (normal (bg, border, text), hover (bg, border, text)); "" = plain QPushButton
_T = "rgba(0,0,0,0)"
BUTTON_LOOKS = {
    "": ((BG_INPUT, BORDER, TEXT_ROW), (BG_INPUT, ACCENT, ACCENT)),
    "small": ((BG_INPUT, BORDER, TEXT_ROW), (BG_INPUT, ACCENT, ACCENT)),
    "rowbtn": ((_T, _T, TEXT_GRAY), (BG_INPUT, ACCENT, ACCENT)),
    "gold": ((ACCENT, ACCENT, DARK_TEXT), ("#f29a4a", "#f29a4a", DARK_TEXT)),
    "scan": ((BG_INPUT, ACCENT, ACCENT), (ACCENT, ACCENT, DARK_TEXT)),
    "stop": ((BG_INPUT, TEXT_GRAY, TEXT_ROW), (BG_INPUT, RED, RED)),
    "smallstop": ((BG_INPUT, TEXT_GRAY, TEXT_ROW), (BG_INPUT, RED, RED)),
    "green": ((BG_INPUT, GREEN, GREEN), (GREEN, GREEN, DARK_TEXT)),
    "ghost": ((_T, BORDER, "#aab3c2"), (_T, ACCENT, ACCENT)),
}
FIELD_LOOK = (BORDER, ACCENT)   # combo boxes and number boxes: only the border fades


class HoverFx(QtCore.QObject):
    """App-wide: plain buttons, combo boxes and number boxes fade to their hover colours
    instead of snapping. Widgets with their own animation (AnimatedButton, Glyph) or their
    own style sheet are left alone. Checked buttons stay in the hover look."""

    def __init__(self, app):
        super().__init__(app)
        self.state = {}         # widget -> [t, target]
        self._tm = QtCore.QTimer(self)
        self._tm.setInterval(16)
        self._tm.timeout.connect(self._step)
        self._el = QtCore.QElapsedTimer()
        self._el.start()
        self._last = 0
        app.installEventFilter(self)

    @staticmethod
    def _kind(w):
        if isinstance(w, QtWidgets.QPushButton):
            if w.property("fx_own") or type(w).__name__ in ("AnimatedButton", "Chevron"):
                return None
            if w.styleSheet() and not w.property("fx_ss"):
                return None
            if w.objectName() not in BUTTON_LOOKS:
                return None
            return "button"
        if isinstance(w, (QtWidgets.QComboBox, QtWidgets.QAbstractSpinBox)):
            if w.styleSheet() and not w.property("fx_ss"):
                return None
            return "field"
        return None

    def eventFilter(self, obj, e):
        et = e.type()
        if et in (QtCore.QEvent.Type.Enter, QtCore.QEvent.Type.Leave, QtCore.QEvent.Type.EnabledChange):
            kind = self._kind(obj) if isinstance(obj, QtWidgets.QWidget) else None
            if kind:
                if et == QtCore.QEvent.Type.EnabledChange and not obj.isEnabled():
                    self.state.pop(obj, None)
                    self._apply(obj, kind, 0.0, clear=True)
                elif et == QtCore.QEvent.Type.Enter and obj.isEnabled():
                    self._go(obj, 1.0)
                elif et == QtCore.QEvent.Type.Leave:
                    self._go(obj, 1.0 if self._checked(obj) else 0.0)
        return False

    @staticmethod
    def _checked(w):
        return isinstance(w, QtWidgets.QAbstractButton) and w.isCheckable() and w.isChecked()

    def _go(self, w, target):
        st = self.state.get(w)
        if st is None:
            st = [0.0, target]
            self.state[w] = st
            try:
                w.destroyed.connect(lambda *_a, ww=w: self.state.pop(ww, None))
            except Exception:
                pass
        st[1] = target
        if not self._tm.isActive():
            self._last = self._el.elapsed()
            self._tm.start()

    def _step(self):
        now = self._el.elapsed()
        dt = min(STEP_CAP_MS, max(1, now - self._last))
        self._last = now
        done = []
        for w, st in list(self.state.items()):
            t, target = st
            if t < target:
                t = min(target, t + dt / HOVER_IN_MS)
            elif t > target:
                t = max(target, t - dt / HOVER_OUT_MS)
            st[0] = t
            try:
                kind = self._kind(w)
                if kind:
                    self._apply(w, kind, ease_out_cubic(t), clear=(t <= 0.0))
            except RuntimeError:          # the widget is gone
                done.append(w)
                continue
            if t == target and t <= 0.0:
                done.append(w)
        for w in done:
            self.state.pop(w, None)
        if all(st[0] == st[1] for st in self.state.values()):
            self._tm.stop()

    @staticmethod
    def _apply(w, kind, t, clear=False):
        if clear:
            if w.property("fx_ss"):
                w.setStyleSheet("")
                w.setProperty("fx_ss", False)
            return
        if kind == "button":
            (b0, d0, f0), (b1, d1, f1) = BUTTON_LOOKS.get(w.objectName(), BUTTON_LOOKS[""])
            ss = ("QPushButton { background-color: %s; border-color: %s; color: %s; }"
                  % (_rgba(lerp(b0, b1, t)), _rgba(lerp(d0, d1, t)), _rgba(lerp(f0, f1, t))))
        else:
            ss = "%s { border-color: %s; }" % ("QComboBox" if isinstance(w, QtWidgets.QComboBox)
                                               else "QAbstractSpinBox", _rgba(lerp(FIELD_LOOK[0], FIELD_LOOK[1], t)))
        w.setProperty("fx_ss", True)
        w.setStyleSheet(ss)


# ------------------------------------------------------------------ header pages
class NavTabs(QtWidgets.QWidget):
    """Page names in the header. Hover fades the text, the orange line glides from where
    it is to the chosen page (OutExpo 420 ms) and grows to its width."""
    changed = QtCore.pyqtSignal(int)
    GAP = 18

    def __init__(self, names, parent=None):
        super().__init__(parent)
        self.names = list(names)
        self.cur = 0
        self.hov = [0.0] * len(self.names)
        self.hov_to = [0.0] * len(self.names)
        self.line = None            # (x, w) now
        self._from = None
        self._to = None
        self.setMouseTracking(True)
        self.setFixedHeight(32)
        self.setCursor(QtCore.Qt.CursorShape.PointingHandCursor)
        f = self.font()
        f.setPixelSize(12)
        f.setWeight(QtGui.QFont.Weight.DemiBold)
        self.setFont(f)
        self.clock = FrameClock(self)
        self.clock.tick.connect(self._line_tick)
        self._htm = QtCore.QTimer(self)
        self._htm.setInterval(16)
        self._htm.timeout.connect(self._hover_tick)
        self.setFixedWidth(self._layout()[-1].right() + 2)

    def _layout(self):
        fm = QtGui.QFontMetrics(self.font())
        x, out = 0, []
        for n in self.names:
            w = fm.horizontalAdvance(n)
            out.append(QtCore.QRect(x, 0, w, self.height()))
            x += w + self.GAP
        return out

    def _target(self, i):
        r = self._layout()[i]
        return float(r.x()), float(r.width())

    def set_current(self, i, animate=True):
        self.cur = i
        tgt = self._target(i)
        if self.line is None or not animate or not self.isVisible():
            self.line = tgt
            self.clock.stop()
            self.update()
            return
        self._from, self._to = self.line, tgt
        self.clock.start()

    def _line_tick(self, ms):
        e = ease_out_expo(ms / ANIM_MS)
        (x0, w0), (x1, w1) = self._from, self._to
        self.line = (x0 + (x1 - x0) * e, w0 + (w1 - w0) * e)
        if ms >= ANIM_MS:
            self.line = self._to
            self.clock.stop()
        self.update()

    def _hit(self, pos):
        for i, r in enumerate(self._layout()):
            if r.adjusted(-self.GAP // 2, 0, self.GAP // 2, 0).contains(pos):
                return i
        return -1

    def mouseMoveEvent(self, e):
        h = self._hit(e.position().toPoint())
        self.hov_to = [1.0 if i == h else 0.0 for i in range(len(self.names))]
        self._htm.start()

    def leaveEvent(self, e):
        self.hov_to = [0.0] * len(self.names)
        self._htm.start()
        super().leaveEvent(e)

    def _hover_tick(self):
        moving = False
        for i in range(len(self.hov)):
            a, b = self.hov[i], self.hov_to[i]
            if a < b:
                self.hov[i] = min(b, a + 16.0 / HOVER_IN_MS)
            elif a > b:
                self.hov[i] = max(b, a - 16.0 / HOVER_OUT_MS)
            moving = moving or self.hov[i] != b
        if not moving:
            self._htm.stop()
        self.update()

    def mousePressEvent(self, e):
        if e.button() == QtCore.Qt.MouseButton.LeftButton:
            i = self._hit(e.position().toPoint())
            if i >= 0:
                self.changed.emit(i)

    def paintEvent(self, _e):
        p = QtGui.QPainter(self)
        p.setRenderHint(QtGui.QPainter.RenderHint.Antialiasing)
        p.setFont(self.font())
        for i, r in enumerate(self._layout()):
            if i == self.cur:
                col = QtGui.QColor(TEXT_WHITE)
            else:
                col = lerp(TEXT_GRAY, TEXT_ROW, ease_out_cubic(self.hov[i]))
            p.setPen(col)
            p.drawText(r.adjusted(0, -1, 0, -1), QtCore.Qt.AlignmentFlag.AlignCenter, self.names[i])
        if self.line is not None:
            x, w = self.line
            p.setPen(QtCore.Qt.PenStyle.NoPen)
            p.setBrush(QtGui.QColor(ACCENT))
            p.drawRoundedRect(QtCore.QRectF(x, self.height() - 3, w, 2), 1, 1)
        p.end()


class TabLine(QtWidgets.QWidget):
    """Orange line under the current tab of a QTabWidget that glides between tabs."""

    def __init__(self, tabs):
        bar = tabs.tabBar()
        super().__init__(bar)
        self.bar = bar
        self.setAttribute(QtCore.Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        self.line = None
        self._from = self._to = None
        self.clock = FrameClock(self)
        self.clock.tick.connect(self._tick)
        bar.currentChanged.connect(lambda i: self.go(i, True))
        bar.installEventFilter(self)
        QtCore.QTimer.singleShot(0, lambda: self.go(bar.currentIndex(), False))

    def _target(self, i):
        if i < 0:
            return None
        r = self.bar.tabRect(i)
        fm = self.bar.fontMetrics()
        w = fm.horizontalAdvance(self.bar.tabText(i))
        return float(r.center().x() - w / 2.0), float(w)

    def go(self, i, animate):
        tgt = self._target(i)
        if tgt is None:
            return
        if self.line is None or not animate:
            self.line = tgt
            self.update()
            return
        self._from, self._to = self.line, tgt
        self.clock.start()

    def _tick(self, ms):
        e = ease_out_expo(ms / ANIM_MS)
        (x0, w0), (x1, w1) = self._from, self._to
        self.line = (x0 + (x1 - x0) * e, w0 + (w1 - w0) * e)
        if ms >= ANIM_MS:
            self.line = self._to
            self.clock.stop()
        self.update()

    def eventFilter(self, obj, e):
        if e.type() in (QtCore.QEvent.Type.Resize, QtCore.QEvent.Type.Show, QtCore.QEvent.Type.LayoutRequest):
            self.setGeometry(self.bar.rect())
            self.raise_()
            if not self.clock.active():
                self.go(self.bar.currentIndex(), False)
        return False

    def paintEvent(self, _e):
        if self.line is None:
            return
        p = QtGui.QPainter(self)
        p.setRenderHint(QtGui.QPainter.RenderHint.Antialiasing)
        p.setPen(QtCore.Qt.PenStyle.NoPen)
        p.setBrush(QtGui.QColor(ACCENT))
        x, w = self.line
        p.drawRoundedRect(QtCore.QRectF(x, self.height() - 3, w, 2), 1, 1)
        p.end()


# ------------------------------------------------------------------ toggle
class ToggleBox(QtWidgets.QCheckBox):
    """A QCheckBox drawn as a small toggle: the knob slides, the track fades to orange."""
    TW, TH = 26, 14

    def __init__(self, text="", parent=None):
        super().__init__(text, parent)
        self._t = 1.0 if self.isChecked() else 0.0
        self._hv = 0.0
        self.setCursor(QtCore.Qt.CursorShape.PointingHandCursor)
        self.setFocusPolicy(QtCore.Qt.FocusPolicy.NoFocus)
        self._a = QtCore.QVariantAnimation(self)
        self._a.setDuration(220)
        self._a.setEasingCurve(QtCore.QEasingCurve.Type.OutCubic)
        self._a.valueChanged.connect(self._set_t)
        self._h = QtCore.QVariantAnimation(self)
        self._h.setDuration(HOVER_IN_MS)
        self._h.valueChanged.connect(self._set_h)
        self.toggled.connect(self._anim)

    def _set_t(self, v):
        self._t = float(v)
        self.update()

    def _set_h(self, v):
        self._hv = float(v)
        self.update()

    def _anim(self, on):
        self._a.stop()
        self._a.setStartValue(self._t)
        self._a.setEndValue(1.0 if on else 0.0)
        if self.isVisible():
            self._a.start()
        else:
            self._set_t(1.0 if on else 0.0)

    def setChecked(self, on):
        super().setChecked(on)
        if not self.isVisible():
            self._set_t(1.0 if on else 0.0)

    def enterEvent(self, e):
        self._h.stop()
        self._h.setStartValue(self._hv)
        self._h.setEndValue(1.0)
        self._h.start()
        super().enterEvent(e)

    def leaveEvent(self, e):
        self._h.stop()
        self._h.setStartValue(self._hv)
        self._h.setEndValue(0.0)
        self._h.start()
        super().leaveEvent(e)

    def sizeHint(self):
        fm = self.fontMetrics()
        tw = fm.horizontalAdvance(self.text()) + 10 if self.text() else 0
        return QtCore.QSize(self.TW + 4 + tw, max(18, fm.height() + 4))

    def minimumSizeHint(self):
        return self.sizeHint()

    def hitButton(self, pos):
        return self.rect().contains(pos)

    def paintEvent(self, _e):
        p = QtGui.QPainter(self)
        p.setRenderHint(QtGui.QPainter.RenderHint.Antialiasing)
        t = self._t
        y = (self.height() - self.TH) / 2.0
        track = QtCore.QRectF(1, y, self.TW, self.TH)
        on_col = QtGui.QColor(ACCENT)
        if not self.isEnabled():
            on_col = QtGui.QColor("#6b4a24")
        bg = lerp(BG_INPUT, on_col, t)
        bd = lerp(lerp(BORDER, ACCENT, self._hv * 0.8), on_col, t)
        p.setPen(QtGui.QPen(bd, 1))
        p.setBrush(bg)
        p.drawRoundedRect(track, self.TH / 2.0, self.TH / 2.0)
        k = self.TH - 4
        kx = track.x() + 2 + (self.TW - k - 4) * t
        p.setPen(QtCore.Qt.PenStyle.NoPen)
        p.setBrush(lerp(lerp(TEXT_GRAY, TEXT_ROW, self._hv), QtGui.QColor("#ffffff"), t))
        p.drawEllipse(QtCore.QRectF(kx, y + 2, k, k))
        if self.text():
            p.setPen(QtGui.QColor(TEXT_ROW if self.isEnabled() else "#5c6478"))
            p.setFont(self.font())
            p.drawText(QtCore.QRectF(self.TW + 10, 0, self.width() - self.TW - 10, self.height()),
                       QtCore.Qt.AlignmentFlag.AlignVCenter | QtCore.Qt.AlignmentFlag.AlignLeft, self.text())
        p.end()


# ------------------------------------------------------------------ drag values
class _DragValue(QtCore.QObject):
    """Drag up / down on a number box changes it (like Fruity Nest menu values);
    a click without moving still puts the caret in for typing."""
    PX = 4

    def __init__(self, box):
        super().__init__(box)
        self.box = box
        self.press = None
        self.dragging = False
        box.setButtonSymbols(QtWidgets.QAbstractSpinBox.ButtonSymbols.NoButtons)
        box.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)
        box.lineEdit().setCursor(QtCore.Qt.CursorShape.SizeVerCursor)
        box.lineEdit().installEventFilter(self)
        if not box.toolTip():
            box.setToolTip("Drag up or down, or click and type")

    def eventFilter(self, obj, e):
        et = e.type()
        if et == QtCore.QEvent.Type.MouseButtonPress and e.button() == QtCore.Qt.MouseButton.LeftButton:
            self.press = (e.globalPosition().y(), self.box.value())
            self.dragging = False
            return False
        if et == QtCore.QEvent.Type.MouseMove and self.press is not None:
            dy = self.press[0] - e.globalPosition().y()
            if not self.dragging and abs(dy) >= 3:
                self.dragging = True
                obj.deselect()
            if self.dragging:
                steps = int(dy / self.PX)
                self.box.setValue(self.press[1] + steps * self.box.singleStep())
                return True
        if et == QtCore.QEvent.Type.MouseButtonRelease and self.press is not None:
            was = self.dragging
            self.press = None
            self.dragging = False
            if was:
                obj.clearFocus()
                return True
        return False


class DragSpinBox(QtWidgets.QSpinBox):
    def __init__(self, parent=None):
        super().__init__(parent)
        self._drag = _DragValue(self)


class DragDoubleSpinBox(QtWidgets.QDoubleSpinBox):
    def __init__(self, parent=None):
        super().__init__(parent)
        self._drag = _DragValue(self)


# ------------------------------------------------------------------ table rows
class RowDelegate(QtWidgets.QStyledItemDelegate):
    """Rows of a tree / list: the hover fill fades in (160 ms) and out (240 ms), the
    selected row has a darker fill and a 3 px orange mark on the left; cells with
    HOVER_ONLY data are drawn only as much as their row is hovered (or selected)."""

    def __init__(self, view):
        super().__init__(view)
        self.view = view
        self.t = {}            # QPersistentModelIndex (column 0) -> 0..1
        self.hot = None
        self._tm = QtCore.QTimer(self)
        self._tm.setInterval(16)
        self._tm.timeout.connect(self._step)
        self._el = QtCore.QElapsedTimer()
        self._el.start()
        self._last = 0
        view.setMouseTracking(True)
        view.viewport().setMouseTracking(True)
        view.viewport().installEventFilter(self)
        view.setAttribute(QtCore.Qt.WidgetAttribute.WA_Hover, False)

    @staticmethod
    def _row_key(index):
        if not index.isValid():
            return None
        return QtCore.QPersistentModelIndex(index.sibling(index.row(), 0))

    def eventFilter(self, obj, e):
        et = e.type()
        if et == QtCore.QEvent.Type.MouseMove:
            self._set_hot(self._row_key(self.view.indexAt(e.position().toPoint())))
        elif et == QtCore.QEvent.Type.Leave:
            self._set_hot(None)
        return False

    def _set_hot(self, key):
        if key == self.hot:
            return
        self.hot = key
        if key is not None and key not in self.t:
            self.t[key] = 0.0
        if not self._tm.isActive():
            self._last = self._el.elapsed()
            self._tm.start()

    def _step(self):
        now = self._el.elapsed()
        dt = min(STEP_CAP_MS, max(1, now - self._last))
        self._last = now
        for k in list(self.t):
            if k == self.hot:
                self.t[k] = min(1.0, self.t[k] + dt / HOVER_IN_MS)
            else:
                self.t[k] = self.t[k] - dt / HOVER_OUT_MS
                if self.t[k] <= 0.0 or not k.isValid():
                    del self.t[k]
        if not self.t or (len(self.t) == 1 and self.hot in self.t and self.t[self.hot] >= 1.0):
            self._tm.stop()
        self.view.viewport().update()

    def hover_of(self, index):
        k = self._row_key(index)
        return ease_out_cubic(self.t.get(k, 0.0)) if k is not None else 0.0

    def paint(self, p, opt, index):
        t = self.hover_of(index)
        sel = bool(opt.state & QtWidgets.QStyle.StateFlag.State_Selected)
        r = QtCore.QRectF(opt.rect)
        if sel:
            p.fillRect(r, QtGui.QColor(ROW_SEL))
        elif t > 0.0:
            c = QtGui.QColor(ROW_HOVER)
            c.setAlphaF(t)
            p.fillRect(r, c)
        o = QtWidgets.QStyleOptionViewItem(opt)
        self.initStyleOption(o, index)
        o.state &= ~(QtWidgets.QStyle.StateFlag.State_Selected | QtWidgets.QStyle.StateFlag.State_MouseOver
                     | QtWidgets.QStyle.StateFlag.State_HasFocus)
        w = opt.widget
        style = w.style() if w is not None else QtWidgets.QApplication.style()
        only = index.data(HOVER_ONLY)
        if only:
            show = 1.0 if sel else t
            blank = QtWidgets.QStyleOptionViewItem(o)
            blank.text = ""
            style.drawControl(QtWidgets.QStyle.ControlElement.CE_ItemViewItem, blank, p, w)  # the row line
            if show > 0.01:
                p.save()
                p.setOpacity(show)
                style.drawControl(QtWidgets.QStyle.ControlElement.CE_ItemViewItem, o, p, w)
                p.restore()
        else:
            style.drawControl(QtWidgets.QStyle.ControlElement.CE_ItemViewItem, o, p, w)
        if sel and index.column() == 0:
            p.save()
            p.setRenderHint(QtGui.QPainter.RenderHint.Antialiasing)
            p.setPen(QtCore.Qt.PenStyle.NoPen)
            p.setBrush(QtGui.QColor(ACCENT))
            p.drawRoundedRect(QtCore.QRectF(r.x(), r.y() + 6, 3, max(4.0, r.height() - 12)), 1.5, 1.5)
            p.restore()


# ------------------------------------------------------------------ rows fly in
class _Reveal(QtWidgets.QWidget):
    """A curtain over `target`: a picture of it is taken once and cut into bands (rows);
    each band slides in from the right and fades in, one after another. The real widgets
    stay where they are under the curtain (no layout is touched)."""
    DX = 24
    STAGGER = 28
    MAX_STAGGER = 320

    def __init__(self, target, bands, bg):
        super().__init__(target)
        self.target = target
        self.bands = bands
        self.bg = QtGui.QColor(bg)
        self.pix = None
        self.setAttribute(QtCore.Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        self.setGeometry(target.rect())
        self.clock = FrameClock(self)
        self.clock.tick.connect(self._tick)
        self.raise_()
        self.show()
        target.installEventFilter(self)
        QtCore.QTimer.singleShot(0, self._shoot)

    def _shoot(self):
        try:
            if callable(self.bands):
                self.bands = self.bands()
            if not self.bands:
                self.finish()
                return
            self.hide()
            self.pix = self.target.grab()
            self.setGeometry(self.target.rect())
            self.show()
            self.raise_()
        except RuntimeError:
            return
        n = max(1, len(self.bands))
        self.stagger = min(self.STAGGER, self.MAX_STAGGER / n)
        self.total = ANIM_MS + self.stagger * n
        self.clock.start()

    def _tick(self, ms):
        self.ms = ms
        if ms >= self.total:
            self.finish()
            return
        self.update()

    def finish(self):
        self.clock.stop()
        try:
            self.target.removeEventFilter(self)
        except RuntimeError:
            pass
        self.hide()
        self.deleteLater()

    def eventFilter(self, obj, e):
        if e.type() in (QtCore.QEvent.Type.Wheel, QtCore.QEvent.Type.Resize, QtCore.QEvent.Type.MouseButtonPress):
            self.finish()
        return False

    def paintEvent(self, _e):
        p = QtGui.QPainter(self)
        p.fillRect(self.rect(), self.bg)
        if self.pix is None:
            p.end()
            return
        dpr = self.pix.devicePixelRatio()
        ms = getattr(self, "ms", 0.0)
        covered = QtGui.QRegion()
        for i, b in enumerate(self.bands):
            covered = covered.united(QtGui.QRegion(b))
            e = ease_out_expo((ms - i * self.stagger) / ANIM_MS)
            if e <= 0.0:
                continue
            p.setOpacity(e)
            src = QtCore.QRectF(b.x() * dpr, b.y() * dpr, b.width() * dpr, b.height() * dpr)
            p.drawPixmap(QtCore.QRectF(b).translated(self.DX * (1.0 - e), 0), self.pix, src)
        p.setOpacity(1.0)
        rest = QtGui.QRegion(self.rect()).subtracted(covered)
        p.setClipRegion(rest)
        p.drawPixmap(0, 0, self.pix)
        p.setClipping(False)
        p.end()


def _old_reveal(target):
    for ch in target.findChildren(_Reveal, options=QtCore.Qt.FindChildOption.FindDirectChildrenOnly):
        ch.finish()


def reveal_tree(tree, bg=PANEL):
    """Rows of a QTreeWidget fly in (call right after filling it)."""
    vp = tree.viewport()
    if not tree.isVisible() or tree.topLevelItemCount() == 0:
        return
    _old_reveal(vp)
    bands = []
    h = vp.height()
    it = tree.topLevelItem(0)
    while it is not None:
        r = tree.visualItemRect(it)
        if r.top() > h:
            break
        if r.height() > 0 and r.bottom() >= 0:
            bands.append(QtCore.QRect(0, r.top(), vp.width(), r.height()))
        it = tree.itemBelow(it)
        if len(bands) > 40:
            break
    if bands:
        _Reveal(vp, bands, bg)


def reveal_widgets(target, widgets, bg=BG_CONTENT, visible_rect=None):
    """Widgets inside `target` (and the rows of trees among them) fly in, top to bottom.
    The curtain goes up at once; the bands are measured on the next turn, after the layout.
    widgets / visible_rect may be callables (read then)."""
    if not target.isVisible():
        return
    _old_reveal(target)
    _Reveal(target, lambda: _bands_of(target, widgets() if callable(widgets) else widgets,
                                      visible_rect() if callable(visible_rect) else visible_rect), bg)


def _bands_of(target, widgets, visible_rect):
    bands = []
    for w in widgets:
        if w is None or not w.isVisible():
            continue
        trees = [w] if isinstance(w, QtWidgets.QTreeWidget) else w.findChildren(QtWidgets.QTreeWidget)
        if trees:
            for t in trees:
                top = t.mapTo(target, QtCore.QPoint(0, 0))
                hh = t.header().height() if not t.isHeaderHidden() else 0
                if hh:
                    bands.append(QtCore.QRect(top.x(), top.y(), t.width(), hh))
                it = t.topLevelItem(0) if t.topLevelItemCount() else None
                while it is not None:
                    r = t.visualItemRect(it)
                    if r.height() > 0:
                        o = t.viewport().mapTo(target, r.topLeft())
                        bands.append(QtCore.QRect(top.x(), o.y(), t.width(), r.height()))
                    it = t.itemBelow(it)
                    if len(bands) > 60:
                        break
        else:
            bands.append(QtCore.QRect(w.mapTo(target, QtCore.QPoint(0, 0)), w.size()))
    if visible_rect is not None:
        bands = [b for b in bands if b.intersects(visible_rect)]
    return bands


# ------------------------------------------------------------------ page fade
class _Fade(QtWidgets.QWidget):
    def __init__(self, host, pix, ms=240):
        super().__init__(host)
        self.pix = pix
        self.op = 1.0
        self.setAttribute(QtCore.Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        self.setGeometry(host.rect())
        self.a = QtCore.QVariantAnimation(self)
        self.a.setDuration(ms)
        self.a.setStartValue(1.0)
        self.a.setEndValue(0.0)
        self.a.setEasingCurve(QtCore.QEasingCurve.Type.OutCubic)
        self.a.valueChanged.connect(self._v)
        self.a.finished.connect(self.deleteLater)
        self.raise_()
        self.show()
        self.a.start()

    def _v(self, v):
        self.op = float(v)
        self.update()

    def paintEvent(self, _e):
        p = QtGui.QPainter(self)
        p.setOpacity(self.op)
        p.drawPixmap(0, 0, self.pix)
        p.end()


def fade_switch(stack, index):
    """Switch a QStackedWidget page with a short cross-fade of the old page."""
    if stack.currentIndex() == index or not stack.isVisible():
        stack.setCurrentIndex(index)
        return
    pix = stack.currentWidget().grab()
    stack.setCurrentIndex(index)
    _Fade(stack, pix)


# ------------------------------------------------------------------ empty tables
class EmptyHint(QtWidgets.QLabel):
    """Centred grey text over a tree while it has no rows; text_fn() gives the text."""

    def __init__(self, tree, text_fn):
        super().__init__(tree.viewport())
        self.tree = tree
        self.text_fn = text_fn if callable(text_fn) else (lambda: text_fn)
        self.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)
        self.setWordWrap(True)
        self.setStyleSheet("color: %s; font-size: 12px; background: transparent;" % TEXT_GRAY)
        self.setAttribute(QtCore.Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        m = tree.model()
        for s in (m.rowsInserted, m.rowsRemoved, m.modelReset, m.layoutChanged):
            s.connect(lambda *_: QtCore.QTimer.singleShot(0, self.sync))
        tree.viewport().installEventFilter(self)
        QtCore.QTimer.singleShot(0, self.sync)

    def eventFilter(self, obj, e):
        if e.type() == QtCore.QEvent.Type.Resize:
            self.sync()
        return False

    def sync(self):
        try:
            empty = self.tree.topLevelItemCount() == 0
        except RuntimeError:
            return
        if empty:
            self.setText(self.text_fn())
            vp = self.tree.viewport()
            self.setGeometry(20, 0, max(10, vp.width() - 40), vp.height())
        self.setVisible(empty)


# ------------------------------------------------------------------ footer hints
class Footer(QtWidgets.QWidget):
    """The hint line at the bottom of the window. Shows the tip of the widget / table
    cell under the mouse (tool tip boxes are not shown any more), or the help of the
    current page (idle_fn) when nothing has a tip. Text changes cross-fade."""

    def __init__(self, window, idle_fn=None):
        super().__init__(window)
        self.win = window
        self.idle_fn = idle_fn or (lambda: "")
        self.setFixedHeight(24)
        self.text = ""
        self.old = ""
        self.mix = 1.0
        self.is_tip = False
        self.a = QtCore.QVariantAnimation(self)
        self.a.setDuration(180)
        self.a.setStartValue(0.0)
        self.a.setEndValue(1.0)
        self.a.valueChanged.connect(self._v)
        self._pending = False
        QtWidgets.QApplication.instance().installEventFilter(self)

    def _v(self, v):
        self.mix = float(v)
        self.update()

    def show_text(self, text, is_tip):
        text = (text or "").strip().replace("\n", "   \u00b7   ")
        if text == self.text:
            return
        self.old, self.text, self.is_tip_old, self.is_tip = self.text, text, self.is_tip, is_tip
        self.a.stop()
        self.a.start()

    def refresh(self):
        self._pending = False
        try:
            tip = self._tip_under_mouse()
        except RuntimeError:
            tip = ""
        if tip:
            self.show_text(tip, True)
        else:
            self.show_text(self.idle_fn() or "", False)

    def _tip_under_mouse(self):
        pos = QtGui.QCursor.pos()
        w = QtWidgets.QApplication.widgetAt(pos)
        if w is None or w.window() is not self.win:
            return ""
        while w is not None and w is not self.win:
            par = w.parentWidget()
            if isinstance(par, QtWidgets.QAbstractItemView) and w is par.viewport():
                idx = par.indexAt(w.mapFromGlobal(pos))
                if idx.isValid():
                    tip = idx.data(QtCore.Qt.ItemDataRole.ToolTipRole)
                    if tip:
                        return str(tip)
            if w.toolTip():
                return w.toolTip()
            w = par
        return ""

    def eventFilter(self, obj, e):
        et = e.type()
        if et == QtCore.QEvent.Type.ToolTip:
            if isinstance(obj, QtWidgets.QWidget) and obj.window() is self.win:
                return True                      # tips go to the footer, no box
        elif et in (QtCore.QEvent.Type.Enter, QtCore.QEvent.Type.MouseMove, QtCore.QEvent.Type.Leave):
            if not self._pending and isinstance(obj, QtWidgets.QWidget) and obj.window() is self.win:
                self._pending = True
                QtCore.QTimer.singleShot(30, self.refresh)
        return False

    def paintEvent(self, _e):
        p = QtGui.QPainter(self)
        p.fillRect(self.rect(), QtGui.QColor(BG_HEADER))
        p.setPen(QtGui.QColor(BORDER_DARK))
        p.drawLine(0, 0, self.width(), 0)
        f = self.font()
        f.setPixelSize(11)
        p.setFont(f)
        r = QtCore.QRectF(12, 1, self.width() - 24, self.height() - 1)
        al = QtCore.Qt.AlignmentFlag.AlignVCenter | QtCore.Qt.AlignmentFlag.AlignLeft
        fm = QtGui.QFontMetrics(f)
        for txt, op, tip in ((self.old, 1.0 - self.mix, getattr(self, "is_tip_old", False)),
                             (self.text, self.mix, self.is_tip)):
            if not txt or op <= 0.0:
                continue
            p.setOpacity(op)
            p.setPen(QtGui.QColor(TEXT_ROW if tip else TEXT_GRAY))
            p.drawText(r, al, fm.elidedText(txt, QtCore.Qt.TextElideMode.ElideRight, int(r.width())))
        p.end()


def install(app):
    """Turn on the app-wide parts (hover fades). Keep the returned object alive."""
    return HoverFx(app)


# ------------------------------------------------------------------ column sorting
ORDER_ROLE = int(QtCore.Qt.ItemDataRole.UserRole) + 41   # the order the program filled the rows in
_ARROW_DOWN = "\u25bc  "
_ARROW_UP = "\u25b2  "


def _sort_key(text):
    """Numbers and m:ss lengths sort as numbers, empty / '-' first, the rest as text
    (dates are YYYY-MM-DD, so they sort right as text)."""
    t = (text or "").strip()
    if not t or t in ("-", "\u2013"):
        return (0, 0.0, "")
    parts = t.split(":")
    if 1 < len(parts) <= 3 and all(p.isdigit() for p in parts):
        v = 0.0
        for p in parts:
            v = v * 60 + int(p)
        return (1, v, "")
    try:
        return (1, float(t.split()[0]), "")
    except (ValueError, IndexError):
        return (2, 0.0, t.lower())


class SortItem(QtWidgets.QTreeWidgetItem):
    """A tree row that sorts by meaning (numbers, lengths, dates, text) and can go back
    to the order the program filled the table in (sort switched off)."""

    def __lt__(self, other):
        tree = self.treeWidget()
        st = getattr(tree, "_fx_sort", None) if tree is not None else None
        if not st:
            return (self.data(0, ORDER_ROLE) or 0) < (other.data(0, ORDER_ROLE) or 0)
        col = st[0]
        a, b = _sort_key(self.text(col)), _sort_key(other.text(col))
        if a == b:
            return (self.data(0, ORDER_ROLE) or 0) < (other.data(0, ORDER_ROLE) or 0)
        return a < b


def make_sortable(tree, store=None, key=None, skip=()):
    """Click a column header: descending -> ascending -> off (the program's own order),
    like the Project Explorer. The sorted column's name is orange with an arrow.
    store / key: a dict that keeps the choice when the table is built again."""
    hi = tree.headerItem()
    tree._fx_heads = [hi.text(i) for i in range(tree.columnCount())]
    tree._fx_skip = set(skip) | {i for i, h in enumerate(tree._fx_heads) if not h.strip()}
    tree._fx_store = (store, key)
    tree._fx_sort = store.get(key) if store is not None else None
    hd = tree.header()
    hd.setSectionsClickable(True)
    hd.setSortIndicatorShown(False)
    hd.setCursor(QtCore.Qt.CursorShape.PointingHandCursor)
    hd.sectionClicked.connect(lambda c, t=tree: cycle_sort(t, c))
    _paint_heads(tree)


def _paint_heads(tree):
    hi = tree.headerItem()
    st = getattr(tree, "_fx_sort", None)
    for i, h in enumerate(tree._fx_heads):
        on = bool(st) and st[0] == i
        hi.setText(i, ((_ARROW_DOWN if st[1] else _ARROW_UP) + h) if on else h)
        hi.setForeground(i, QtGui.QBrush(QtGui.QColor(ACCENT if on else TEXT_GRAY)))


def cycle_sort(tree, col):
    if col in getattr(tree, "_fx_skip", ()):
        return
    st = getattr(tree, "_fx_sort", None)
    if st and st[0] == col:
        st = (col, False) if st[1] else None
    else:
        st = (col, True)
    tree._fx_sort = st
    store, key = getattr(tree, "_fx_store", (None, None))
    if store is not None:
        store[key] = st
    _paint_heads(tree)
    resort(tree)
    hook = getattr(tree, "_fx_after_sort", None)
    if hook:
        hook()


def resort(tree):
    """Sort a freshly filled (or re-sorted) tree by its current choice. Rows without a fill
    number get one in their present order first."""
    n = tree.topLevelItemCount()
    top = 0
    for i in range(n):
        o = tree.topLevelItem(i).data(0, ORDER_ROLE)
        if o is not None:
            top = max(top, o + 1)
    for i in range(n):
        it = tree.topLevelItem(i)
        if it.data(0, ORDER_ROLE) is None:
            it.setData(0, ORDER_ROLE, top)
            top += 1
    _old_reveal(tree.viewport())   # a running fly-in shows the old order: end it
    st = getattr(tree, "_fx_sort", None)
    if st:
        tree.sortItems(st[0], QtCore.Qt.SortOrder.DescendingOrder if st[1] else QtCore.Qt.SortOrder.AscendingOrder)
    else:
        tree.sortItems(0, QtCore.Qt.SortOrder.AscendingOrder)
