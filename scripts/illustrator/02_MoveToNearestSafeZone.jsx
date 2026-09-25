#target illustrator
// Move the selection as a unit to the nearest safe-zone edge, fully inside.
(function () {
    if (!app.documents.length) { alert('Open a document first.'); return; }
    var doc = app.activeDocument, selected = doc.selection;
    if (!selected || !selected.length || selected.typename === 'TextRange') {
        alert('Select whole objects with the Selection Tool (V) first.'); return;
    }
    var oldCoordinates = app.coordinateSystem, moved = [], dx = 0, dy = 0;
    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    function containsGuide(item) {
        if (item.typename === 'PathItem') return item.guides;
        if (item.typename === 'GroupItem') {
            for (var j = 0; j < item.pageItems.length; j++) {
                if (containsGuide(item.pageItems[j])) return true;
            }
        }
        return false;
    }
    function bounds(item) {
        // Clipping groups use the clipping path, not hidden artwork outside it.
        if (item.typename === 'GroupItem' && item.clipped) {
            for (var j = 0; j < item.pageItems.length; j++) {
                var child = item.pageItems[j];
                if (child.typename === 'PathItem' && child.clipping) return child.geometricBounds;
                if (child.typename === 'CompoundPathItem') {
                    for (var k = 0; k < child.pathItems.length; k++) {
                        if (child.pathItems[k].clipping) return child.geometricBounds;
                    }
                }
            }
            throw new Error('Clipping path not found. Select a simpler object.');
        }
        if (item.typename === 'GroupItem' && item.pageItems.length) {
            var combined = null;
            for (var n = 0; n < item.pageItems.length; n++) {
                var b = bounds(item.pageItems[n]);
                combined = combined ? [Math.min(combined[0], b[0]), Math.max(combined[1], b[1]),
                    Math.max(combined[2], b[2]), Math.min(combined[3], b[3])] : [b[0], b[1], b[2], b[3]];
            }
            return combined;
        }
        return item.visibleBounds;
    }
    try {
        app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
        var items = [], i, j;
        for (i = 0; i < selected.length; i++) {
            var item = selected[i], parent = item.parent, nested = false;
            while (parent && parent.typename !== 'Document') {
                for (j = 0; j < selected.length; j++) if (parent === selected[j]) nested = true;
                parent = parent.parent;
            }
            if (nested) continue;
            if (!item.editable || typeof item.translate !== 'function' || containsGuide(item)) {
                throw new Error('Select editable artwork only, without guides. Use Selection Tool (V).');
            }
            items.push(item);
        }
        var box = null;
        for (i = 0; i < items.length; i++) {
            var v = bounds(items[i]);
            if (!v || v.length !== 4) throw new Error('Unsupported selection. Select whole objects.');
            for (j = 0; j < 4; j++) if (!isFinite(v[j])) throw new Error('Invalid object bounds.');
            box = box ? [Math.min(box[0], v[0]), Math.max(box[1], v[1]),
                Math.max(box[2], v[2]), Math.min(box[3], v[3])] : [v[0], v[1], v[2], v[3]];
        }
        if (!box) return;
        var r = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
        var inset = 3 * 72 / 25.4;
        var safe = [r[0] + inset, r[1] - inset, r[2] - inset, r[3] + inset];
        var w = box[2] - box[0], h = box[1] - box[3];
        if (safe[2] <= safe[0] || safe[1] <= safe[3] || w > safe[2] - safe[0] || h > safe[1] - safe[3]) {
            throw new Error('The selection is larger than the safe zone. No objects were moved or resized.');
        }
        var x = clamp(box[0], safe[0], safe[2] - w);
        var y = clamp(box[1], safe[3] + h, safe[1]);
        // Four feasible placements; choose the shortest translation (left wins ties).
        var candidates = [[safe[0], y], [safe[2] - w, y], [x, safe[1]], [x, safe[3] + h]];
        var best = Infinity;
        for (i = 0; i < candidates.length; i++) {
            var tx = candidates[i][0] - box[0], ty = candidates[i][1] - box[1];
            var distance = tx * tx + ty * ty;
            if (distance < best) { best = distance; dx = tx; dy = ty; }
        }
        if (Math.abs(dx) < 0.000001 && Math.abs(dy) < 0.000001) return;
        for (i = 0; i < items.length; i++) {
            items[i].translate(dx, dy); moved.push(items[i]);
        }
        app.redraw();
    } catch (e) {
        var rollbackFailed = false;
        for (var m = moved.length - 1; m >= 0; m--) {
            try { moved[m].translate(-dx, -dy); } catch (rollback) { rollbackFailed = true; }
        }
        alert('Cannot move to safe zone: ' + e.message + (rollbackFailed ? '\nSome objects could not be restored. Use Undo to review.' : ''));
    } finally {
        app.coordinateSystem = oldCoordinates;
    }
}());
