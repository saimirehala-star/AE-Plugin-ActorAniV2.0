#target aftereffects
#targetengine "ActorAniV20Engine"

(function ActorAniV20(thisObj) {
    var SCRIPT_NAME = "ActorAni V2.0";
    var SCRIPT_VERSION = "2.0.0";
    var EXPRESSION_SIGNATURE = "// ActorAni V2.0 generated expression";
    var DATA_START = "[[ActorAniV2:BEGIN]]";
    var DATA_END = "[[ActorAniV2:END]]";
    var PLACEHOLDER = "<请选择动画标记>";
    var DEFAULT_MARKER_DURATION = 1.0;

    var STATES = [
        { key: "front_left_idle", label: "正_左_待机" },
        { key: "front_right_idle", label: "正_右_待机" },
        { key: "back_left_idle", label: "背_左_待机" },
        { key: "back_right_idle", label: "背_右_待机" },
        { key: "front_left_walk", label: "正_左_走" },
        { key: "front_right_walk", label: "正_右_走" },
        { key: "back_left_walk", label: "背_左_走" },
        { key: "back_right_walk", label: "背_右_走" }
    ];

    var state = {
        ui: null,
        currentLayer: null,
        currentSource: null,
        markers: [],
        markerReport: null
    };

    function trimText(value) {
        return value ? value.toString().replace(/^\s+|\s+$/g, "") : "";
    }

    function showError(message) {
        alert(SCRIPT_NAME + "\n\n" + message);
    }

    function setStatus(message) {
        if (state.ui && state.ui.statusText) {
            state.ui.statusText.text = message || "";
        }
    }

    function safeEncode(value) {
        try {
            return encodeURIComponent(value || "");
        } catch (encodeError) {
            return value || "";
        }
    }

    function safeDecode(value) {
        try {
            return decodeURIComponent(value || "");
        } catch (decodeError) {
            return value || "";
        }
    }

    function quoteExpressionString(value) {
        var text = value === undefined || value === null ? "" : value.toString();
        return "\"" + text
            .replace(/\\/g, "\\\\")
            .replace(/\"/g, "\\\"")
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n")
            .replace(/\u2028/g, "\\u2028")
            .replace(/\u2029/g, "\\u2029") + "\"";
    }

    function removeDataBlock(commentText) {
        var text = commentText || "";
        var startIndex = text.indexOf(DATA_START);
        var endIndex;
        if (startIndex < 0) {
            return text;
        }
        endIndex = text.indexOf(DATA_END, startIndex + DATA_START.length);
        if (endIndex < 0) {
            return text.substring(0, startIndex);
        }
        return text.substring(0, startIndex) + text.substring(endIndex + DATA_END.length);
    }

    function buildDataBlock(mapping, sourceName) {
        var lines = [DATA_START];
        var i;
        lines.push("version=" + SCRIPT_VERSION);
        lines.push("source=" + safeEncode(sourceName || ""));
        for (i = 0; i < STATES.length; i++) {
            lines.push(STATES[i].key + "=" + safeEncode(mapping[STATES[i].key] || ""));
        }
        lines.push(DATA_END);
        return lines.join("\n");
    }

    function writeLayerMapping(layer, mapping) {
        var original = layer.comment || "";
        var clean = removeDataBlock(original);
        clean = clean.replace(/[\r\n]+$/g, "");
        layer.comment = (clean ? clean + "\n" : "") + buildDataBlock(mapping, layer.source ? layer.source.name : "");
    }

    function readLayerMapping(layer) {
        var result = {};
        var text = layer && layer.comment ? layer.comment : "";
        var startIndex = text.indexOf(DATA_START);
        var endIndex;
        var block;
        var lines;
        var i;
        var splitIndex;
        var key;
        var value;

        if (startIndex < 0) {
            return result;
        }
        endIndex = text.indexOf(DATA_END, startIndex + DATA_START.length);
        if (endIndex < 0) {
            return result;
        }
        block = text.substring(startIndex + DATA_START.length, endIndex);
        lines = block.split(/\r\n|\r|\n/);
        for (i = 0; i < lines.length; i++) {
            splitIndex = lines[i].indexOf("=");
            if (splitIndex < 1) {
                continue;
            }
            key = trimText(lines[i].substring(0, splitIndex));
            value = safeDecode(lines[i].substring(splitIndex + 1));
            result[key] = value;
        }
        return result;
    }

    function isCompItem(item) {
        return item && (item instanceof CompItem);
    }

    function getActiveComp() {
        var item = app.project ? app.project.activeItem : null;
        return isCompItem(item) ? item : null;
    }

    function getSelectedPrecompLayer(showMessage) {
        var comp = getActiveComp();
        var layer;
        if (!comp) {
            if (showMessage) {
                showError("请先打开主合成，并选中其中的一个预合成图层。");
            }
            return null;
        }
        if (!comp.selectedLayers || comp.selectedLayers.length !== 1) {
            if (showMessage) {
                showError("请在主合成中只选中一个预合成图层，然后再读取标记。");
            }
            return null;
        }
        layer = comp.selectedLayers[0];
        if (!layer.source || !isCompItem(layer.source)) {
            if (showMessage) {
                showError("当前选中的图层不是预合成图层。\n请选择源素材为合成的图层。");
            }
            return null;
        }
        return layer;
    }

    function readSourceMarkers(sourceComp) {
        var report = {
            valid: [],
            duplicates: [],
            invalid: []
        };
        var markerProperty;
        var seen = {};
        var duplicateSeen = {};
        var i;
        var markerValue;
        var markerName;
        var lookupKey;
        var duration;

        if (!isCompItem(sourceComp)) {
            return report;
        }
        markerProperty = sourceComp.markerProperty;
        if (!markerProperty) {
            return report;
        }

        for (i = 1; i <= markerProperty.numKeys; i++) {
            markerValue = markerProperty.keyValue(i);
            markerName = markerValue && markerValue.comment !== undefined ? markerValue.comment.toString() : "";
            duration = markerValue && markerValue.duration ? Number(markerValue.duration) : 0;
            if (!trimText(markerName)) {
                report.invalid.push("第 " + i + " 个标记没有名称");
                continue;
            }
            if (!(duration > Math.max(0.000001, sourceComp.frameDuration * 0.1))) {
                report.invalid.push("“" + markerName + "”不是范围标记（持续时间为 0）");
                continue;
            }
            lookupKey = "$" + markerName;
            if (seen[lookupKey]) {
                if (!duplicateSeen[lookupKey]) {
                    report.duplicates.push(markerName);
                    duplicateSeen[lookupKey] = true;
                }
                continue;
            }
            seen[lookupKey] = true;
            report.valid.push({
                name: markerName,
                time: markerProperty.keyTime(i),
                duration: duration,
                index: i
            });
        }
        return report;
    }

    function clearDropdown(dropdown) {
        if (!dropdown) {
            return;
        }
        while (dropdown.items && dropdown.items.length > 0) {
            dropdown.remove(dropdown.items[0]);
        }
    }

    function getDropdownText(dropdown) {
        if (!dropdown || !dropdown.selection || dropdown.selection.index < 1) {
            return "";
        }
        return dropdown.selection.text || "";
    }

    function fillDropdown(dropdown, markers, desiredName) {
        var selectedIndex = 0;
        var i;
        clearDropdown(dropdown);
        dropdown.add("item", PLACEHOLDER);
        for (i = 0; i < markers.length; i++) {
            dropdown.add("item", markers[i].name);
            if (markers[i].name === desiredName) {
                selectedIndex = i + 1;
            }
        }
        dropdown.selection = selectedIndex;
    }

    function collectPanelMapping() {
        var mapping = {};
        var i;
        for (i = 0; i < STATES.length; i++) {
            mapping[STATES[i].key] = getDropdownText(state.ui.dropdowns[i]);
        }
        return mapping;
    }

    function populateMappingDropdowns(report, desiredMapping) {
        var i;
        desiredMapping = desiredMapping || {};
        for (i = 0; i < STATES.length; i++) {
            fillDropdown(
                state.ui.dropdowns[i],
                report.valid,
                desiredMapping[STATES[i].key] || ""
            );
        }
    }

    function buildMarkerWarning(report) {
        var parts = [];
        if (report.duplicates.length > 0) {
            parts.push("需修正同名标记：" + report.duplicates.join("、"));
        }
        if (report.invalid.length > 0) {
            parts.push("已忽略非范围或无名标记 " + report.invalid.length + " 个");
        }
        return parts.join("；");
    }

    function refreshFromSelection(showMessage) {
        var layer = getSelectedPrecompLayer(showMessage);
        var previousMapping;
        var storedMapping;
        var report;
        var warning;

        if (!layer) {
            if (!showMessage) {
                setStatus("在主合成中选中一个预合成图层，然后点击“读取/刷新标记”。");
            }
            return false;
        }

        previousMapping = state.currentLayer === layer ? collectPanelMapping() : null;
        storedMapping = readLayerMapping(layer);
        report = readSourceMarkers(layer.source);

        state.currentLayer = layer;
        state.currentSource = layer.source;
        state.markers = report.valid;
        state.markerReport = report;

        populateMappingDropdowns(report, previousMapping || storedMapping);
        state.ui.selectionText.text = "图层：“" + layer.name + "”\n源预合成：“" + layer.source.name + "”";
        warning = buildMarkerWarning(report);
        setStatus(
            "已读取 " + report.valid.length + " 个可用范围标记" +
            (warning ? "；" + warning + "。" : "。请选择八种状态后点击“应用”。")
        );
        return true;
    }

    function markerNameExists(comp, expectedName) {
        var markerProperty = comp.markerProperty;
        var i;
        var markerValue;
        var name;
        for (i = 1; i <= markerProperty.numKeys; i++) {
            markerValue = markerProperty.keyValue(i);
            name = markerValue && markerValue.comment !== undefined ? markerValue.comment.toString() : "";
            if (name === expectedName) {
                return true;
            }
        }
        return false;
    }

    function markerExistsAtTime(comp, markerTime) {
        var markerProperty = comp.markerProperty;
        var tolerance = Math.max(0.000001, comp.frameDuration * 0.01);
        var i;
        for (i = 1; i <= markerProperty.numKeys; i++) {
            if (Math.abs(markerProperty.keyTime(i) - markerTime) <= tolerance) {
                return true;
            }
        }
        return false;
    }

    function askForMarkerName(comp) {
        var dialog = new Window("dialog", "添加动画范围标记");
        var promptText;
        var input;
        var errorText;
        var buttons;
        var okButton;
        var cancelButton;
        var result = "";

        dialog.orientation = "column";
        dialog.alignChildren = ["fill", "top"];
        dialog.spacing = 10;
        dialog.margins = 16;

        promptText = dialog.add("statictext", undefined, "动画名称：");
        input = dialog.add("edittext", undefined, "");
        input.characters = 32;
        input.active = true;
        errorText = dialog.add("statictext", undefined, " ");
        errorText.graphics.foregroundColor = errorText.graphics.newPen(
            errorText.graphics.PenType.SOLID_COLOR,
            [0.85, 0.2, 0.2, 1],
            1
        );

        buttons = dialog.add("group");
        buttons.alignment = ["right", "top"];
        okButton = buttons.add("button", undefined, "确认", { name: "ok" });
        cancelButton = buttons.add("button", undefined, "取消", { name: "cancel" });

        okButton.onClick = function () {
            var name = trimText(input.text);
            if (!name) {
                errorText.text = "请输入动画名称。";
                return;
            }
            if (/\r|\n/.test(name)) {
                errorText.text = "动画名称不能包含换行。";
                return;
            }
            if (markerNameExists(comp, name)) {
                errorText.text = "该名称已经存在，请使用唯一名称。";
                return;
            }
            result = name;
            dialog.close(1);
        };
        cancelButton.onClick = function () {
            dialog.close(0);
        };

        return dialog.show() === 1 ? result : "";
    }

    function getDefaultMarkerDuration(comp, startTime) {
        var remaining = Math.max(0, comp.duration - startTime);
        var frameDuration = comp.frameDuration;
        var duration = Math.min(DEFAULT_MARKER_DURATION, remaining);
        var wholeFrames;

        if (remaining + 0.000001 < frameDuration) {
            return 0;
        }
        wholeFrames = Math.floor((duration / frameDuration) + 0.000001);
        duration = Math.max(frameDuration, wholeFrames * frameDuration);
        if (duration > remaining) {
            duration = Math.max(frameDuration, Math.floor((remaining / frameDuration) + 0.000001) * frameDuration);
        }
        return duration <= remaining + 0.000001 ? duration : 0;
    }

    function addRangeMarker() {
        var comp = getActiveComp();
        var startTime;
        var duration;
        var markerName;
        var markerValue;

        if (!comp) {
            showError("请先打开需要添加动画标记的预合成。");
            return;
        }
        if (!comp.markerProperty) {
            showError("当前 AE 版本不支持合成标记脚本接口。");
            return;
        }

        startTime = comp.time;
        duration = getDefaultMarkerDuration(comp, startTime);
        if (!(duration > 0)) {
            showError("当前时间太靠近合成结尾，无法创建至少一帧的范围标记。\n请把时间指示器向前移动。");
            return;
        }
        if (markerExistsAtTime(comp, startTime)) {
            showError("当前时间已经有一个合成标记。\n请移动时间指示器后再添加，避免覆盖原标记。");
            return;
        }

        markerName = askForMarkerName(comp);
        if (!markerName) {
            return;
        }

        app.beginUndoGroup(SCRIPT_NAME + " - 添加范围标记");
        try {
            markerValue = new MarkerValue(markerName);
            markerValue.duration = duration;
            comp.markerProperty.setValueAtTime(startTime, markerValue);
            setStatus(
                "已在“" + comp.name + "”添加范围标记：“" + markerName +
                "”（初始范围 " + duration.toFixed(3) + " 秒，可在时间线上调整）。"
            );
        } catch (markerError) {
            showError("添加标记失败：\n" + markerError.toString());
        } finally {
            app.endUndoGroup();
        }
    }

    function validateMapping(mapping, report) {
        var missing = [];
        var available = {};
        var i;
        var markerName;

        if (report.duplicates.length > 0) {
            return "源预合成中存在同名标记：" + report.duplicates.join("、") + "。\n请先把每个动画标记改为唯一名称。";
        }
        for (i = 0; i < report.valid.length; i++) {
            available["$" + report.valid[i].name] = true;
        }
        for (i = 0; i < STATES.length; i++) {
            markerName = mapping[STATES[i].key] || "";
            if (!markerName || !available["$" + markerName]) {
                missing.push(STATES[i].label);
            }
        }
        if (missing.length > 0) {
            return "以下状态尚未选择有效的动画标记：\n" + missing.join("、");
        }
        return "";
    }

    function buildTimeRemapExpression(mapping) {
        var markerNames = [];
        var lines = [];
        var i;
        for (i = 0; i < STATES.length; i++) {
            markerNames.push(quoteExpressionString(mapping[STATES[i].key]));
        }

        lines.push(EXPRESSION_SIGNATURE);
        lines.push("var AA_MAP = [" + markerNames.join(",") + "];");
        lines.push("var AA_EPS = 0.01;");
        lines.push("var AA_TIME_EPS = 0.000001;");
        lines.push("function aaAddTime(list, t){");
        lines.push("  for (var i = 0; i < list.length; i++){");
        lines.push("    if (Math.abs(list[i] - t) <= AA_TIME_EPS){ return; }");
        lines.push("  }");
        lines.push("  list.push(t);");
        lines.push("}");
        lines.push("function aaAddPropertyKeys(list, prop){");
        lines.push("  try{");
        lines.push("    for (var i = 1; i <= prop.numKeys; i++){ aaAddTime(list, prop.key(i).time); }");
        lines.push("  }catch(err){}");
        lines.push("}");
        lines.push("function aaKeyTimes(){");
        lines.push("  var list = [];");
        lines.push("  aaAddPropertyKeys(list, transform.position);");
        lines.push("  if (list.length < 2){");
        lines.push("    try{ aaAddPropertyKeys(list, transform.xPosition); }catch(errX){}");
        lines.push("    try{ aaAddPropertyKeys(list, transform.yPosition); }catch(errY){}");
        lines.push("  }");
        lines.push("  list.sort(function(a, b){ return a - b; });");
        lines.push("  return list;");
        lines.push("}");
        lines.push("function aaPositionAt(t){");
        lines.push("  try{");
        lines.push("    var p = transform.position.valueAtTime(t);");
        lines.push("    if (p !== null && p.length >= 2){ return [p[0], p[1]]; }");
        lines.push("  }catch(errP){}");
        lines.push("  try{ return [transform.xPosition.valueAtTime(t), transform.yPosition.valueAtTime(t)]; }catch(errXY){}");
        lines.push("  return [0, 0];");
        lines.push("}");
        lines.push("function aaDeltaAt(aTime, bTime){");
        lines.push("  var a = aaPositionAt(aTime);");
        lines.push("  var b = aaPositionAt(bTime);");
        lines.push("  return [b[0] - a[0], b[1] - a[1]];");
        lines.push("}");
        lines.push("function aaIsMoving(delta){");
        lines.push("  return Math.abs(delta[0]) > AA_EPS || Math.abs(delta[1]) > AA_EPS;");
        lines.push("}");
        lines.push("function aaSegmentAt(t, times){");
        lines.push("  var info = {moving:false, active:false, dx:0, dy:0, start:inPoint};");
        lines.push("  if (times.length < 2){ return info; }");
        lines.push("  if (t < times[0]){ return info; }");
        lines.push("  for (var i = 0; i < times.length - 1; i++){");
        lines.push("    if (t >= times[i] && t < times[i + 1]){");
        lines.push("      var d = aaDeltaAt(times[i], times[i + 1]);");
        lines.push("      info.dx = d[0];");
        lines.push("      info.dy = d[1];");
        lines.push("      info.moving = aaIsMoving(d);");
        lines.push("      info.active = true;");
        lines.push("      info.start = times[i];");
        lines.push("      return info;");
        lines.push("    }");
        lines.push("  }");
        lines.push("  info.start = times[times.length - 1];");
        lines.push("  return info;");
        lines.push("}");
        lines.push("function aaDirectionAt(t, times){");
        lines.push("  var back = false;");
        lines.push("  var right = false;");
        lines.push("  for (var i = 0; i < times.length - 1; i++){");
        lines.push("    if (times[i] > t){ break; }");
        lines.push("    var d = aaDeltaAt(times[i], times[i + 1]);");
        lines.push("    if (!aaIsMoving(d)){ continue; }");
        lines.push("    if (Math.abs(d[1]) > AA_EPS){ back = d[1] < 0; }");
        lines.push("    if (Math.abs(d[0]) > AA_EPS){ right = d[0] > 0; }");
        lines.push("  }");
        lines.push("  return {back:back, right:right};");
        lines.push("}");
        lines.push("function aaModulo(value, divisor){");
        lines.push("  return ((value % divisor) + divisor) % divisor;");
        lines.push("}");
        lines.push("var aaResult = value;");
        lines.push("try{");
        lines.push("  var aaTimes = aaKeyTimes();");
        lines.push("  var aaSegment = aaSegmentAt(time, aaTimes);");
        lines.push("  var aaDirection = aaDirectionAt(time, aaTimes);");
        lines.push("  var aaMoving = aaSegment.active && aaSegment.moving;");
        lines.push("  var aaStateIndex = (aaMoving ? 4 : 0) + (aaDirection.back ? 2 : 0) + (aaDirection.right ? 1 : 0);");
        lines.push("  var aaMarker = thisLayer.source.marker.key(AA_MAP[aaStateIndex]);");
        lines.push("  var aaSourceFrame = thisLayer.source.frameDuration;");
        lines.push("  var aaDuration = Math.max(aaSourceFrame, aaMarker.duration);");
        lines.push("  var aaElapsed = Math.max(0, time - aaSegment.start);");
        lines.push("  var aaOffset = aaModulo(aaElapsed, aaDuration);");
        lines.push("  var aaLastFrameOffset = Math.max(0, aaMarker.duration - aaSourceFrame);");
        lines.push("  aaResult = aaMarker.time + Math.min(aaOffset, aaLastFrameOffset);");
        lines.push("}catch(aaError){}");
        lines.push("aaResult;");
        return lines.join("\n");
    }

    function isActorAniExpression(expressionText) {
        return expressionText && expressionText.indexOf(EXPRESSION_SIGNATURE) === 0;
    }

    function applyAnimationMapping() {
        var layer = getSelectedPrecompLayer(true);
        var report;
        var mapping;
        var validationError;
        var timeRemap;
        var previousEnabled;
        var previousExpression = "";
        var previousExpressionEnabled = false;
        var previousComment;
        var expressionText;
        var expressionError;

        if (!layer) {
            return;
        }
        if (state.currentLayer !== layer) {
            if (!refreshFromSelection(true)) {
                return;
            }
        }

        report = readSourceMarkers(layer.source);
        state.markerReport = report;
        mapping = collectPanelMapping();
        validationError = validateMapping(mapping, report);
        if (validationError) {
            showError(validationError);
            return;
        }
        if (layer.canSetTimeRemapEnabled === false) {
            showError("当前预合成图层不能启用时间重映射。");
            return;
        }

        previousEnabled = layer.timeRemapEnabled === true;
        if (previousEnabled) {
            timeRemap = layer.property("ADBE Time Remapping");
            previousExpression = timeRemap && timeRemap.expression ? timeRemap.expression : "";
            previousExpressionEnabled = timeRemap ? timeRemap.expressionEnabled : false;
            if (!isActorAniExpression(previousExpression)) {
                if (!confirm(
                    SCRIPT_NAME + "\n\n当前图层已经启用了时间重映射。\n" +
                    "应用后将由 ActorAni 表达式接管该属性，是否继续？"
                )) {
                    return;
                }
            }
        }

        previousComment = layer.comment || "";
        expressionText = buildTimeRemapExpression(mapping);
        app.beginUndoGroup(SCRIPT_NAME + " - 应用动画切换");
        try {
            layer.timeRemapEnabled = true;
            timeRemap = layer.property("ADBE Time Remapping");
            if (!timeRemap || !timeRemap.canSetExpression) {
                throw new Error("无法访问该图层的时间重映射表达式属性。");
            }
            timeRemap.expression = expressionText;
            timeRemap.expressionEnabled = true;
            expressionError = timeRemap.expressionError || "";
            if (expressionError) {
                throw new Error("表达式错误：" + expressionError);
            }
            writeLayerMapping(layer, mapping);
            state.currentLayer = layer;
            state.currentSource = layer.source;
            setStatus("应用完成：“" + layer.name + "”会根据位置关键帧自动切换动画。");
        } catch (applyError) {
            try {
                layer.comment = previousComment;
                if (previousEnabled) {
                    layer.timeRemapEnabled = true;
                    timeRemap = layer.property("ADBE Time Remapping");
                    timeRemap.expression = previousExpression;
                    timeRemap.expressionEnabled = previousExpressionEnabled;
                } else {
                    layer.timeRemapEnabled = false;
                }
            } catch (restoreError) {
            }
            showError("应用失败：\n" + applyError.toString());
        } finally {
            app.endUndoGroup();
        }
    }

    function buildUI(thisObj) {
        var panel = (thisObj instanceof Panel) ? thisObj : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });
        var markerPanel;
        var markerHelp;
        var markerButtonRow;
        var mappingPanel;
        var selectionRow;
        var rows;
        var row;
        var label;
        var footer;
        var i;

        panel.orientation = "column";
        panel.alignChildren = ["fill", "top"];
        panel.spacing = 8;
        panel.margins = 10;

        state.ui = {
            root: panel,
            dropdowns: []
        };

        markerPanel = panel.add("panel", undefined, "1. 预合成范围标记");
        markerPanel.orientation = "column";
        markerPanel.alignChildren = ["fill", "top"];
        markerPanel.margins = 10;
        markerHelp = markerPanel.add(
            "statictext",
            undefined,
            "进入预合成，把时间指示器移到动画起点，再添加标记。\n标记默认约 1 秒（合成末尾可能更短），之后可调整范围。",
            { multiline: true }
        );
        markerHelp.preferredSize.height = 34;
        markerButtonRow = markerPanel.add("group");
        markerButtonRow.orientation = "row";
        markerButtonRow.alignChildren = ["fill", "center"];
        state.ui.addMarkerButton = markerButtonRow.add("button", undefined, "添加标记");

        mappingPanel = panel.add("panel", undefined, "2. 主合成动画匹配");
        mappingPanel.orientation = "column";
        mappingPanel.alignChildren = ["fill", "top"];
        mappingPanel.margins = 10;
        selectionRow = mappingPanel.add("group");
        selectionRow.orientation = "row";
        selectionRow.alignChildren = ["fill", "center"];
        state.ui.selectionText = selectionRow.add(
            "statictext",
            undefined,
            "尚未读取预合成图层",
            { multiline: true }
        );
        state.ui.selectionText.preferredSize = [280, 38];
        state.ui.refreshButton = selectionRow.add("button", undefined, "读取/刷新标记");

        rows = mappingPanel.add("group");
        rows.orientation = "column";
        rows.alignChildren = ["fill", "top"];
        rows.spacing = 5;
        for (i = 0; i < STATES.length; i++) {
            row = rows.add("group");
            row.orientation = "row";
            row.alignChildren = ["left", "center"];
            label = row.add("statictext", undefined, STATES[i].label);
            label.preferredSize.width = 92;
            state.ui.dropdowns[i] = row.add("dropdownlist", undefined, [PLACEHOLDER]);
            state.ui.dropdowns[i].selection = 0;
            state.ui.dropdowns[i].preferredSize.width = 250;
        }

        state.ui.applyButton = mappingPanel.add("button", undefined, "应用到选中的预合成图层");

        footer = panel.add("panel", undefined, "状态");
        footer.orientation = "column";
        footer.alignChildren = ["fill", "top"];
        footer.margins = 8;
        state.ui.statusText = footer.add(
            "statictext",
            undefined,
            "等待操作。",
            { multiline: true }
        );
        state.ui.statusText.preferredSize.height = 38;

        state.ui.addMarkerButton.onClick = addRangeMarker;
        state.ui.refreshButton.onClick = function () {
            refreshFromSelection(true);
        };
        state.ui.applyButton.onClick = applyAnimationMapping;

        panel.layout.layout(true);
        panel.layout.resize();
        panel.onResizing = panel.onResize = function () {
            this.layout.resize();
        };
        return panel;
    }

    var panel = buildUI(thisObj);
    refreshFromSelection(false);
    if (panel instanceof Window) {
        panel.center();
        panel.show();
    }
}(this));
