#target illustrator
// Create/update one non-printing safe-zone guide on the ACTIVE artboard.
(function () {
    if (!app.documents.length) { alert('Open a document first.'); return; }
    var doc = app.activeDocument, index = doc.artboards.getActiveArtboardIndex();
    var oldCoordinates = app.coordinateSystem, oldLayer = doc.activeLayer;
    var layer = null, wasLocked = false;
    var marker = 'iprint.safezone.v1.artboard.' + index;
    try {
        app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
        var r = doc.artboards[index].artboardRect, inset = 3 * 72 / 25.4;
        if (r[2] - r[0] <= 2 * inset || r[1] - r[3] <= 2 * inset) {
            alert('The artboard must be wider and taller than 6 mm.'); return;
        }
        for (var i = 0; i < doc.layers.length; i++) {
            if (doc.layers[i].name === 'iPrint Safe Zone 3mm') { layer = doc.layers[i]; break; }
        }
        if (!layer) { layer = doc.layers.add(); layer.name = 'iPrint Safe Zone 3mm'; }
        wasLocked = layer.locked; layer.locked = false; layer.visible = true;
        layer.printable = false;
        var guide = null;
        for (i = layer.pathItems.length - 1; i >= 0; i--) {
            if (layer.pathItems[i].note === marker) {
                if (!guide) guide = layer.pathItems[i];
                else layer.pathItems[i].remove();
            }
        }
        if (!guide) guide = layer.pathItems.add();
        guide.locked = false; guide.guides = false;
        guide.setEntirePath([[r[0] + inset, r[1] - inset], [r[2] - inset, r[1] - inset],
            [r[2] - inset, r[3] + inset], [r[0] + inset, r[3] + inset]]);
        guide.closed = true; guide.filled = false; guide.stroked = false;
        guide.name = 'Safe Zone 3mm - Artboard ' + (index + 1);
        guide.note = marker; guide.guides = true; guide.selected = false;
        layer.locked = true;
        app.redraw();
    } catch (e) {
        if (layer) layer.locked = wasLocked;
        alert('Cannot create safe zone: ' + e.message);
    } finally {
        app.coordinateSystem = oldCoordinates;
        try { doc.activeLayer = oldLayer; } catch (ignore) {}
    }
}());
