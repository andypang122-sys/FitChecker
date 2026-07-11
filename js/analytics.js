'use strict';
/* Analytics dashboard — tallies fit choices and colour undertone responses */

const Dashboard = (() => {

  function getStats(responses) {
    const garmentResponses = [];
    const colourResponses = [];

    responses.forEach(r => {
      if (r.answers._colour) {
        colourResponses.push(r);
      } else {
        garmentResponses.push(r);
      }
    });

    const stats = { garment: [], colour: [] };

    // ---- Garment analysis tallies ----
    if (garmentResponses.length > 0) {
      const garmentCounts = {
        type: {}, fitPref: {}, pickedSize: {}, sex: {}
      };
      let typeAnswered = 0, fitAnswered = 0, sizeAnswered = 0, sexAnswered = 0;

      garmentResponses.forEach(r => {
        if (r.answers.garmentType) { typeAnswered++; garmentCounts.type[r.answers.garmentType] = (garmentCounts.type[r.answers.garmentType] || 0) + 1; }
        if (r.answers.fitPref) { fitAnswered++; garmentCounts.fitPref[r.answers.fitPref] = (garmentCounts.fitPref[r.answers.fitPref] || 0) + 1; }
        if (r.answers.pickedSize !== undefined && r.answers.pickedSize !== '') { sizeAnswered++; garmentCounts.pickedSize[r.answers.pickedSize] = (garmentCounts.pickedSize[r.answers.pickedSize] || 0) + 1; }
        if (r.answers.newSex) { sexAnswered++; garmentCounts.sex[r.answers.newSex] = (garmentCounts.sex[r.answers.newSex] || 0) + 1; }
      });

      // Garment type (from FitEngine.SIZE_CHARTS keys)
      if (typeAnswered > 0) {
        const typeLabelMap = { tshirt: 'T-shirt', shirt: 'Shirt', hoodie: 'Hoodie', jacket: 'Jacket', dress: 'Dress', jeans: 'Jeans', shorts: 'Shorts', skirt: 'Skirt' };
        const typeOptions = [];
        Object.keys(garmentCounts.type).forEach(type => {
          const count = garmentCounts.type[type];
          const percent = Math.round((count / typeAnswered) * 100);
          typeOptions.push({ label: typeLabelMap[type] || type, count, percent });
        });
        typeOptions.sort((a, b) => b.count - a.count);
        stats.garment.push({ q: 'Garment type', options: typeOptions, answeredCount: typeAnswered });
      }

      // Fit preference (slim, regular, relaxed)
      if (fitAnswered > 0) {
        const fitLabelMap = { slim: 'Slim / fitted', regular: 'Regular', relaxed: 'Relaxed / oversized' };
        const fitOptions = [];
        Object.keys(garmentCounts.fitPref).forEach(fit => {
          const count = garmentCounts.fitPref[fit];
          const percent = Math.round((count / fitAnswered) * 100);
          fitOptions.push({ label: fitLabelMap[fit] || fit, count, percent });
        });
        fitOptions.sort((a, b) => b.count - a.count);
        stats.garment.push({ q: 'Preferred fit', options: fitOptions, answeredCount: fitAnswered });
      }

      // Size considered (if provided)
      if (sizeAnswered > 0) {
        const sizeOptions = [];
        Object.keys(garmentCounts.pickedSize).forEach(size => {
          const count = garmentCounts.pickedSize[size];
          const percent = Math.round((count / sizeAnswered) * 100);
          sizeOptions.push({ label: size || 'Not sure', count, percent });
        });
        sizeOptions.sort((a, b) => b.count - a.count);
        stats.garment.push({ q: 'Size considering', options: sizeOptions, answeredCount: sizeAnswered });
      }

      // Sex/sizing (if answered)
      if (sexAnswered > 0) {
        const sexLabelMap = { female: 'Female sizing', male: 'Male sizing' };
        const sexOptions = [];
        Object.keys(garmentCounts.sex).forEach(sex => {
          const count = garmentCounts.sex[sex];
          const percent = Math.round((count / sexAnswered) * 100);
          sexOptions.push({ label: sexLabelMap[sex] || sex, count, percent });
        });
        sexOptions.sort((a, b) => b.count - a.count);
        stats.garment.push({ q: 'Sizing preference', options: sexOptions, answeredCount: sexAnswered });
      }
    }

    // ---- Colour undertone tallies ----
    if (colourResponses.length > 0) {
      const colourCounts = { veins: {}, metal: {}, sun: {} };
      let veinsAnswered = 0, metalAnswered = 0, sunAnswered = 0;

      colourResponses.forEach(r => {
        if (r.answers.veins) { veinsAnswered++; colourCounts.veins[r.answers.veins] = (colourCounts.veins[r.answers.veins] || 0) + 1; }
        if (r.answers.metal) { metalAnswered++; colourCounts.metal[r.answers.metal] = (colourCounts.metal[r.answers.metal] || 0) + 1; }
        if (r.answers.sun) { sunAnswered++; colourCounts.sun[r.answers.sun] = (colourCounts.sun[r.answers.sun] || 0) + 1; }
      });

      // Veins
      if (veinsAnswered > 0) {
        const veinLabelMap = { cool: 'Blue / purple', warm: 'Green', neutral: 'Hard to tell' };
        const veinOptions = [];
        Object.keys(colourCounts.veins).forEach(v => {
          const count = colourCounts.veins[v];
          const percent = Math.round((count / veinsAnswered) * 100);
          veinOptions.push({ label: veinLabelMap[v] || v, count, percent });
        });
        veinOptions.sort((a, b) => b.count - a.count);
        stats.colour.push({ q: 'Wrist veins', options: veinOptions, answeredCount: veinsAnswered });
      }

      // Metal
      if (metalAnswered > 0) {
        const metalLabelMap = { cool: 'Silver', warm: 'Gold', neutral: 'Both look fine' };
        const metalOptions = [];
        Object.keys(colourCounts.metal).forEach(m => {
          const count = colourCounts.metal[m];
          const percent = Math.round((count / metalAnswered) * 100);
          metalOptions.push({ label: metalLabelMap[m] || m, count, percent });
        });
        metalOptions.sort((a, b) => b.count - a.count);
        stats.colour.push({ q: 'Metal preference', options: metalOptions, answeredCount: metalAnswered });
      }

      // Sun
      if (sunAnswered > 0) {
        const sunLabelMap = { cool: 'Burns, rarely tans', warm: 'Tans easily', neutral: 'A bit of both' };
        const sunOptions = [];
        Object.keys(colourCounts.sun).forEach(s => {
          const count = colourCounts.sun[s];
          const percent = Math.round((count / sunAnswered) * 100);
          sunOptions.push({ label: sunLabelMap[s] || s, count, percent });
        });
        sunOptions.sort((a, b) => b.count - a.count);
        stats.colour.push({ q: 'Sun response', options: sunOptions, answeredCount: sunAnswered });
      }
    }

    return stats;
  }

  function renderDashboard(responses) {
    if (!responses || !responses.length) {
      return `
        <h1 class="mb-8">Analytics</h1>
        <p class="muted mb-16">See what matters most to your users — tallied on this device only.</p>
        <div class="card"><div class="empty"><div class="empty-emoji">📊</div><h3>No responses yet</h3><p class="muted small">Once people take fit checks or refine their colours, analytics will show up here.</p></div></div>
        <a class="btn btn-ghost" href="#/settings">← Back to settings</a>`;
    }

    const stats = getStats(responses);
    let html = `
      <h1 class="mb-8">Analytics</h1>
      <p class="muted mb-16">See what matters most to your users — tallied on this device only.</p>
      <div class="stat-row"><div class="stat"><div class="num">${responses.length}</div><div class="lbl">Responses</div></div></div>`;

    // Garment analysis section
    if (stats.garment.length > 0) {
      html += `<div class="card"><div class="section-label">Fit Analysis</div>`;
      stats.garment.forEach(qstat => {
        html += `<div class="subsection" style="margin-bottom:16px"><strong>${qstat.q}</strong>`;
        qstat.options.forEach(opt => {
          const barWidth = Math.round(opt.percent * 100);
          html += `<div class="stat-bar-row" style="font-size:0.95em"><span class="sb-name">${opt.label}</span><span class="bar-track"><span class="bar-fill" style="width:${barWidth}%"></span></span><span class="sb-n">${opt.count} (${opt.percent}%)</span></div>`;
        });
        html += `</div>`;
      });
      html += `</div>`;
    }

    // Colour undertone section
    if (stats.colour.length > 0) {
      html += `<div class="card"><div class="section-label">Colour Undertones</div>`;
      stats.colour.forEach(qstat => {
        html += `<div class="subsection" style="margin-bottom:16px"><strong>${qstat.q}</strong>`;
        qstat.options.forEach(opt => {
          const barWidth = Math.round(opt.percent * 100);
          html += `<div class="stat-bar-row" style="font-size:0.95em"><span class="sb-name">${opt.label}</span><span class="bar-track"><span class="bar-fill" style="width:${barWidth}%"></span></span><span class="sb-n">${opt.count} (${opt.percent}%)</span></div>`;
        });
        html += `</div>`;
      });
      html += `</div>`;
    }

    html += `<a class="btn btn-ghost" href="#/settings">← Back to settings</a>`;
    return html;
  }

  return { getStats, renderDashboard };
})();
