// app.js - UI controller for Iron Man 3D Design v2
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('armorCanvas');
  const ironMan = new IronMan3D(canvas);

  // Preset buttons
  const presetButtons = document.querySelectorAll('.preset-btn');
  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      presetButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const preset = btn.getAttribute('data-preset');
      ironMan.setViewPreset(preset);
    });
  });

  // Action buttons
  const btnUnibeam = document.getElementById('btnUnibeam');
  const btnMissiles = document.getElementById('btnMissiles');
  const btnFlight = document.getElementById('btnFlight');
  const btnRotate = document.getElementById('btnRotate');
  const btnDiagnostics = document.getElementById('btnDiagnostics');

  btnUnibeam.addEventListener('click', () => {
    ironMan.combatMode = 1.0;
    setTimeout(() => { ironMan.combatMode = 0.0; }, 1800);
    showHudAlert('UNIBEAM PULSE FIRED // 100% CAPACITY');
  });

  btnMissiles.addEventListener('click', () => {
    showHudAlert('MICRO-MUNITIONS LOCKED // TARGET ACQUIRED');
  });

  btnFlight.addEventListener('click', () => {
    ironMan.setViewPreset('flight');
    showHudAlert('FLIGHT STABILIZERS ENGAGED');
  });

  let orbitActive = true;
  btnRotate.addEventListener('click', () => {
    ironMan.autoRotate = !ironMan.autoRotate;
    orbitActive = ironMan.autoRotate;
    btnRotate.classList.toggle('active-action', orbitActive);
    showHudAlert(orbitActive ? 'AUTO-ORBIT RESUMED' : 'MANUAL LOCK ACTIVE');
  });

  btnDiagnostics.addEventListener('click', () => {
    showHudAlert('SYSTEM INTEGRITY 100% // NANO-TECH REPAIR ONLINE');
  });

  function showHudAlert(text) {
    const label = document.querySelector('.status-label');
    const oldText = label.textContent;
    label.textContent = text;
    label.style.color = '#ff3344';
    setTimeout(() => {
      label.textContent = oldText;
      label.style.color = '';
    }, 2200);
  }
});
