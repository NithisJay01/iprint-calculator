#target illustrator
/* AutoBleed - ExtendScript (ES3). Artboard edges are the final trim size. */
(function () {
    if (!app.documents.length) { alert('Open an Illustrator document first.'); return; }
    var doc = app.activeDocument;
    var ui = new Window('dialog', 'Auto Bleed + Trim Marks');
    ui.orientation = 'column'; ui.alignChildren = 'left';
    ui.add('statictext', undefined, 'Artboard = final trim size. Extend backgrounds to the bleed guide.');
    var row = ui.add('group'); row.add('statictext', undefined, 'Bleed (mm):');
    var input = row.add('edittext', undefined, '3'); input.characters = 8;
    var all = ui.add('checkbox', undefined, 'All artboards');
    var marks = ui.add('checkbox', undefined, 'Create trim marks on a separate layer'); marks.value = true;
    var pdf = ui.add('checkbox', undefined, 'Save as PDF with bleed and native trim marks');
    ui.add('statictext', undefined, 'PDF uses Save As: save your .ai first; the active document becomes the PDF.');
    var buttons = ui.add('group');
    var run = buttons.add('button', undefined, 'Run', {name: 'ok'});
    buttons.add('button', undefined, 'Cancel', {name: 'cancel'});
    var mm;
    run.onClick = function () {
        mm = Number(input.text.replace(',', '.'));
        if (!isFinite(mm) || mm <= 0 || mm > 25) { alert('Enter a bleed between 0 and 25 mm (greater than 0).'); return; }
        ui.close(1);
    };
    if (ui.show() !== 1) return;
    var target = null;
    if (pdf.value) {
        target = File.saveDialog('Save PDF with bleed', '*.pdf');
        if (!target) return;
        if (!/\.pdf$/i.test(target.name)) target = new File(target.fsName + '.pdf');
        if (target.exists && !confirm('Replace existing PDF?\n' + target.fsName)) return;
    }
    var previousCoordinates = app.coordinateSystem;
    var previousLayer = doc.activeLayer;
    var guideLayer = null, markLayer = null;
    var pt = 72 / 25.4, bleed = mm * pt, gap = bleed + pt, length = 5 * pt;
    var first = all.value ? 0 : doc.artboards.getActiveArtboardIndex();
    var last = all.value ? doc.artboards.length - 1 : first;
    function rectGuide(layer, left, top, width, height, name) {
        var p = layer.pathItems.rectangle(top, left, width, height);
        p.name = name; p.filled = false; p.stroked = false; p.guides = true;
    }
    function line(layer, a, b, color) {
        var p = layer.pathItems.add(); p.setEntirePath([a, b]);
        p.filled = false; p.stroked = true; p.strokeWidth = 0.25;
        p.strokeColor = color; p.strokeOverprint = true;
    }
    try {
        app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
        guideLayer = doc.layers.add(); guideLayer.name = 'AutoBleed guides ' + mm + 'mm';
        guideLayer.printable = false;
        var ink = new CMYKColor(); ink.cyan = 0; ink.magenta = 0; ink.yellow = 0; ink.black = 100;
        // Prefer the document's registration spot, independent of UI language.
        for (var s = 0; s < doc.spots.length; s++) {
            if (doc.spots[s].colorType === ColorModel.REGISTRATION) {
                ink = new SpotColor(); ink.spot = doc.spots[s]; ink.tint = 100; break;
            }
        }
        if (marks.value) { markLayer = doc.layers.add(); markLayer.name = 'AutoBleed trim marks'; }
        for (var i = first; i <= last; i++) {
            var r = doc.artboards[i].artboardRect;
            var l = r[0], t = r[1], right = r[2], bottom = r[3];
            rectGuide(guideLayer, l, t, right - l, t - bottom, 'Trim ' + (i + 1));
            rectGuide(guideLayer, l - bleed, t + bleed, right - l + 2 * bleed, t - bottom + 2 * bleed, 'Bleed ' + (i + 1));
            if (markLayer) {
                var ys = [t, bottom], xs = [l, right];
                for (var j = 0; j < 2; j++) {
                    line(markLayer, [l - gap - length, ys[j]], [l - gap, ys[j]], ink);
                    line(markLayer, [right + gap, ys[j]], [right + gap + length, ys[j]], ink);
                    line(markLayer, [xs[j], t + gap], [xs[j], t + gap + length], ink);
                    line(markLayer, [xs[j], bottom - gap], [xs[j], bottom - gap - length], ink);
                }
            }
        }
        guideLayer.locked = true;
        if (markLayer) markLayer.locked = true;
        if (target) {
            var opts = new PDFSaveOptions();
            opts.bleedLink = true; opts.bleedOffsetRect = [bleed, bleed, bleed, bleed];
            opts.artboardRange = all.value ? '' : String(first + 1);
            opts.trimMarks = true; opts.offset = gap;
            opts.preserveEditability = true;
            // Native PDF marks handle each page; suppress drawn marks to avoid duplicates.
            var hidden = [];
            try {
                for (var k = 0; k < doc.layers.length; k++) {
                    var layer = doc.layers[k];
                    if (layer.name === 'AutoBleed trim marks' && layer.visible) {
                        hidden.push(layer); layer.visible = false;
                    }
                }
                doc.saveAs(target, opts);
            } finally {
                for (var h = 0; h < hidden.length; h++) hidden[h].visible = true;
            }
        }
        app.redraw();
        alert('Created bleed guides: ' + mm + ' mm on ' + (last - first + 1) + ' artboard(s).\nExtend artwork to the outer guide. Document Setup bleed is unchanged.' + (target ? '\nPDF saved with bleed and trim marks. Active document is now the PDF.' : '\nFor PDF bleed: run again with Save as PDF enabled, or set Marks and Bleeds when saving.'));
    } catch (e) {
        alert('AutoBleed could not finish: ' + e.message + '\nLine: ' + e.line + '\nAny generated layers are kept for inspection.');
    } finally {
        app.coordinateSystem = previousCoordinates;
        try { doc.activeLayer = previousLayer; } catch (ignore) {}
    }
}());
