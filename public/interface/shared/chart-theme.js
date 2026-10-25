/* ============================================================
   WAWE JOURNAL - SHARED CHART THEME (window.WwChart)
   Loaded on every app page by BaseHead, next to chart-theme.css.
   Every chart (ApexCharts, Lightweight Charts, hand-made SVG) takes its
   font, label sizes, grid, colors and hover card from here, so all pages
   look the same. Read the values at render time: they follow the theme.
   ============================================================ */
(function (global) {
  'use strict';

  var FONT = "'Geist', system-ui, sans-serif";

  function isLight() {
    var d = global.document;
    return !!(d && d.body && d.body.classList.contains('light-theme'));
  }

  // Colors for the current theme. Dark mode is plain black, not the theme's tinted surfaces.
  function colors() {
    var light = isLight();
    return {
      text: light ? '#1e293b' : '#e8e8f0',
      muted: light ? '#64748b' : '#a8a8c0',
      axis: light ? '#475569' : '#c9c9d6',
      grid: light ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.05)',
      zero: light ? 'rgba(100,116,139,0.35)' : 'rgba(168,168,192,0.28)',
      up: light ? '#16a34a' : '#22c55e',
      down: light ? '#dc2626' : '#ef4444',
      surface: light ? '#ffffff' : '#000000',
      line: light ? 'rgba(15,23,42,0.1)' : 'rgba(255,255,255,0.1)'
    };
  }

  var SIZE = { axis: '12px', legend: '12px', tip: '11px' };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  /* Hover card HTML (styled by .ww-tip in chart-theme.css).
     spec: { title, value, valueCls: 'up'|'down'|'', rows: [{ label, value, cls, color, sep }] }
     title/value/rows are plain text and get escaped; pass html: true on a row to skip that. */
  function tipHtml(spec) {
    spec = spec || {};
    var out = '<div class="ww-tip">';
    if (spec.title !== undefined && spec.title !== '') out += '<div class="ww-tip-title">' + esc(spec.title) + '</div>';
    if (spec.value !== undefined && spec.value !== '') {
      out += '<div class="ww-tip-value' + (spec.valueCls ? ' ' + spec.valueCls : '') + '">' + esc(spec.value) + '</div>';
    }
    (spec.rows || []).forEach(function (r) {
      var sw = r.color ? '<i class="ww-tip-swatch" style="background:' + esc(r.color) + '"></i>' : '';
      var label = r.html ? r.label : esc(r.label);
      var value = r.html ? r.value : esc(r.value);
      out += '<div class="ww-tip-row' + (r.sep ? ' ww-tip-sep' : '') + '"><span>' + sw + label + '</span>' +
        (value !== undefined && value !== '' ? '<b class="' + (r.cls || '') + '">' + value + '</b>' : '') + '</div>';
    });
    return out + '</div>';
  }

  // ApexCharts axis label style ({ style: WwChart.axisLabels() } inside xaxis.labels / yaxis.labels).
  // 12px in a lighter gray than other muted text, so tick labels stay crisp on black.
  function axisLabels() {
    return { colors: colors().axis, fontSize: SIZE.axis, fontFamily: FONT, fontWeight: 500 };
  }

  /* ApexCharts defaults every chart starts from. Merge a chart's own options on top:
       new ApexCharts(el, WwChart.apex({ chart: { type: 'bar', height: 220 }, series: [...] }))
     Nested objects are merged one level deep per key (chart, grid, tooltip, xaxis, yaxis,
     legend, dataLabels, plotOptions); a chart's own keys win. */
  function apexBase() {
    var c = colors();
    return {
      chart: {
        fontFamily: FONT,
        foreColor: c.muted,
        background: 'transparent',
        toolbar: { show: false },
        zoom: { enabled: false }
      },
      theme: { mode: isLight() ? 'light' : 'dark' },
      grid: {
        borderColor: c.grid,
        strokeDashArray: 0,
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
        padding: { left: 6, right: 6 }
      },
      dataLabels: { enabled: false },
      legend: {
        fontFamily: FONT,
        fontSize: SIZE.legend,
        fontWeight: 500,
        labels: { colors: c.muted, useSeriesColors: false },
        markers: { size: 5 }
      },
      tooltip: {
        theme: isLight() ? 'light' : 'dark',
        style: { fontSize: SIZE.tip, fontFamily: FONT }
      },
      xaxis: {
        labels: { style: axisLabels() },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: {
        labels: { style: axisLabels() }
      },
      states: {
        hover: { filter: { type: 'lighten', value: 0.06 } },
        active: { filter: { type: 'none' } }
      }
    };
  }

  function isPlain(o) { return o && typeof o === 'object' && !Array.isArray(o); }

  function mergeDeep(base, extra) {
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    Object.keys(extra || {}).forEach(function (k) {
      var b = out[k], e = extra[k];
      // yaxis may be an array of axes: give each one the base label style
      if (k === 'yaxis' && Array.isArray(e) && isPlain(b)) {
        out[k] = e.map(function (ax) { return mergeDeep(b, ax); });
      } else if (isPlain(b) && isPlain(e)) {
        out[k] = mergeDeep(b, e);
      } else {
        out[k] = e;
      }
    });
    return out;
  }

  function apex(options) { return mergeDeep(apexBase(), options || {}); }

  // Bars: one corner and one maximum thickness for every bar chart.
  var BAR = { columnWidth: '45%', barHeight: '55%', borderRadius: 4, maxPx: 44 };

  /* Bar thickness as the percentage ApexCharts wants, capped at BAR.maxPx so a chart
     with two or three categories does not draw slabs. size = the plot's width (vertical
     bars) or height (horizontal bars) in px; count = categories. */
  function barSize(size, count) {
    var n = Math.max(1, Number(count) || 1);
    var slot = (Number(size) || 0) / n;
    if (slot <= 0) return BAR.columnWidth;
    var pct = Math.min(parseFloat(BAR.columnWidth), (BAR.maxPx / slot) * 100);
    return Math.max(8, Math.round(pct)) + '%';
  }

  /* Lightweight Charts defaults (merge into createChart options):
       LightweightCharts.createChart(el, WwChart.lwc({ width, height, ... })) */
  function lwcBase() {
    var c = colors();
    return {
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: c.axis,
        fontFamily: FONT,
        fontSize: 12
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: c.grid }
      },
      crosshair: {
        vertLine: { color: c.muted, width: 1, style: 3, labelBackgroundColor: c.surface },
        horzLine: { color: c.muted, width: 1, style: 3, labelBackgroundColor: c.surface }
      },
      rightPriceScale: { borderVisible: false },
      leftPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false }
    };
  }

  function lwc(options) { return mergeDeep(lwcBase(), options || {}); }

  global.WwChart = {
    FONT: FONT,
    SIZE: SIZE,
    BAR: BAR,
    barSize: barSize,
    isLight: isLight,
    colors: colors,
    esc: esc,
    tipHtml: tipHtml,
    axisLabels: axisLabels,
    apexBase: apexBase,
    apex: apex,
    lwcBase: lwcBase,
    lwc: lwc,
    mergeDeep: mergeDeep
  };
})(typeof window !== 'undefined' ? window : this);
