# Editing palettes in the X-Ray

The X-Ray is the inspector view for seeing and editing palette colors in OKLCh-ish color space. It is not just a chart; it is a set of different handles on the same palette.

## Opening the X-Ray

The X-Ray lives in the **Inspector** panel as one of five tabs: *Pixel*, *Families*, *Diagnostics*, **X-Ray**, and *Histogram*. Click the **X-Ray** tab to open it, or cycle through inspector tabs with **Shift+I** until you land on it.

`I` on its own toggles the floating inspector open and closed if it is hidden entirely.

Once you are there, you will see a plot of your current palette plus a small row of view buttons across the top. Those buttons matter, because the current view determines what you can edit.

## Views

The X-Ray offers five ways of looking at the same palette. They are not restyled versions of one chart; each one surfaces a different property of your colors.

| View | What it shows | Editable? |
|---|---|---|
| **Scatter** | Hue across the x-axis, lightness up the y-axis | **Yes** |
| **Wheel** | A polar OKLCh wheel: hue around the rim, chroma as distance from center | **Yes** |
| **Tonal** | A one-dimensional lightness ramp, left/dark to right/light | **Yes** |
| **Proximity** | A pairwise distance matrix that surfaces colors sitting too close together | No — read-only |
| **Cylinder** | A rotatable 3D LCH volume you can orbit by dragging | No — read-only |

The short version: **Scatter, Wheel, and Tonal are the editing views.** Proximity and Cylinder are diagnostic. They help you decide what to change; they do not change it.

This split is deliberate:

- **Scatter** is your two-axis workhorse. One drag adjusts both hue and lightness at once.
- **Wheel** is for hue-and-chroma decisions: rotate a color around the rim, or pull it toward the center to desaturate it, while its lightness stays put.
- **Tonal** is the surgical one. It changes only lightness, so you can fix a tonal gap without disturbing hue or chroma.

## What you can and cannot move

You can only reposition editable manual swatches.

The X-Ray plots every color in your active palette, but they do not all behave the same way. Generated colors, locked colors, and colors derived from a source image are shown for context. You can see them and click them, but you cannot drag them. Only unlocked swatches in a **manual palette** respond to a reposition gesture.

If you try to drag something that is not editable, the app does not move it. Instead, you will see a status message: *"Alt-drag reposition works on editable manual swatches."* That is not an error. It is the app telling you that you grabbed the wrong kind of color.

To edit a generated palette by hand, capture it to your manual palette first. `Shift+M` does this. Once captured, its swatches become fair game.

## Repositioning a swatch

Moving a swatch is an **Alt-drag**:

1. Switch to **Scatter**, **Wheel**, or **Tonal**.
2. Hold **Alt**.
3. Press on the swatch marker you want to move.
4. Drag. The swatch follows your pointer, and the preview updates live.
5. Release.

A few things worth knowing about how the drag feels:

- **It is live.** The image preview re-renders continuously while you drag, so you are editing against the real result, not a guess.
- **Each view constrains the drag to its own axes.** In Scatter you move hue and lightness. In Wheel you move hue and chroma, with lightness held constant. In Tonal you move lightness only.
- **The neutral column is real.** In Scatter, there is a narrow band on the far left labeled "neutral." Drag a swatch into it and the color collapses to a true neutral: chroma drops to zero. Drag back out and it picks up chroma again.

When you let go, the move is committed to history, and the status line confirms it with the new color. The whole Alt-drag, from press to release, is one undoable step. If it goes ugly, `Ctrl/Cmd+Z` puts it back.

### If a drag goes wrong mid-gesture

If you start a drag and think better of it, releasing after a real move still commits. But a drag that is canceled by the system — for example, if the pointer leaves the window — is treated as a cancel: the swatch snaps back to where it started and nothing is recorded.

The reliable escape hatch is still simple: finish the drag, then undo.

## Recoloring pixels without losing the source match

By default, an Alt-drag replaces the swatch's source color. Sometimes you want to move the visible output color while making sure the swatch still matches the original source color.

Hold **Shift** while Alt-dragging to do exactly this.

At the moment your pointer moves, the swatch's original color is pinned as a match anchor. X-Ray draws that anchor as a rotated diamond connected to the swatch by a dashed line. The swatch's new position becomes the rendered output. Source pixels near both the original position and the new position will route to this swatch.

That diamond is editable too. In **Scatter**, **Wheel**, and **Tonal**, hold **Alt** and drag the match anchor itself to move the catch point without moving the rendered swatch. Same deal as swatch dragging: Scatter changes hue/lightness, Wheel changes hue/chroma, Tonal changes lightness only.

This is particularly useful after capturing a generated palette. You can nudge swatches toward better target colors while preserving the image's original color routing, then move the anchor until the source catch is exactly where you need it.

## Promoting a match anchor back into the source

The companion gesture: if a swatch has an extra match anchor and you decide you actually want that color to be the swatch's real source, you can promote it.

**Alt+Shift+double-click** a draggable swatch marker. The swatch's match anchor becomes its source color, and the status line confirms the swap.

If the swatch has no match anchor to promote, the app tells you rather than doing anything surprising: *"Swatch N has no extra match anchor to make into its source."*

This also works as a reset for the anchor-drop gesture. Drop an anchor while dragging, move it around, decide you did not want to recolor those pixels after all: Alt+Shift+double-click places the swatch back in its original location with no extra match anchor.

## Clicking a swatch without Alt

Plain interactions — no Alt held — do not move anything. They select and toggle.

- **Plain click / Enter / Space:** selects the swatch. If it is an editable manual swatch, this also opens it for editing in the manual palette editor.
- **Shift+click:** toggles the diagnostic overlay for that swatch, isolating its pixels in the preview so you can see exactly where that color lands in the image. Shift+click the same swatch again to turn the overlay off.
- **Ctrl+click** or **Cmd+click** on an editable swatch: toggles **mute**. A muted swatch stays in your palette but is pulled out of active assignment. X-Ray draws it with a small diagonal slash so you can spot it at a glance.

One guard rail: the app will not let you mute your last remaining active swatch. A palette needs at least one color doing the work.

Every marker is keyboard-reachable: **Tab** to a swatch, then press **Enter** or **Space** to activate it. The editing drags are pointer gestures; there is not currently a keyboard equivalent for Alt-drag repositioning.

## Reading the markers

While you are editing, the swatch markers tell you about their own state.

- A **diagonal slash** through a marker means the swatch is **muted**.
- A marker drawn as **selected** is the one currently open in the manual editor.
- Markers also reflect **locked** and **cycle-tagged** states.
- Hovering a marker shows a tooltip with the swatch number, its color, and any of those states spelled out in words.

So if a swatch is not responding to an Alt-drag, glance at its marker first. A slash, or a "locked" tooltip, usually explains why.
