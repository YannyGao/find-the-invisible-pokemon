const API = 'https://pokeapi.co/api/v2';
const ART = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const MINI = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
const GEN_RANGES = {
  1: [1,151], 2: [152,251], 3: [252,386], 4: [387,493], 5: [494,649],
  6: [650,721], 7: [722,809], 8: [810,905], 9: [906,1025], all: [1,1025]
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const titleCase = value => value.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
const pad = id => String(id).padStart(4, '0');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function getProximityProfile(proximity) {
  const p = Math.max(0, Math.min(1, proximity));
  const level = p >= .93 ? 5 : p >= .8 ? 4 : p >= .6 ? 3 : p >= .34 ? 2 : 1;
  const labels = ['Distant', 'Nearby', 'Close', 'Very close', 'Almost there'];
  return {
    level,
    label: labels[level - 1],
    volume: .025 + .975 * Math.pow(p, 2.25),
    rate: .94 + .34 * Math.pow(p, 1.7),
    interval: 140 + 1760 * (1 - Math.pow(p, 1.55))
  };
}

const state = {
  list: [],
  cache: new Map(),
  round: 1,
  rounds: 10,
  score: 0,
  current: null,
  choices: [],
  answered: false,
  generation: 'all',
  libraryLimit: 40,
  audio: new Audio(),
  soundOn: true,
  huntPhase: 'loading',
  huntTarget: { x: .5, y: .5 },
  pointer: { x: .5, y: .5 },
  proximity: 0,
  proximityBand: 0,
  huntTimer: null,
  helperId: null,
  stats: loadStats()
};

function loadStats() {
  try {
    return Object.assign({ heard: 0, answered: 0, correct: 0, bestStreak: 0, currentStreak: 0, discovered: [], identified: [], favorites: [], helperId: null, lastDay: null }, JSON.parse(localStorage.getItem('crydex-progress') || '{}'));
  } catch { return { heard: 0, answered: 0, correct: 0, bestStreak: 0, currentStreak: 0, discovered: [], identified: [], favorites: [], helperId: null, lastDay: null }; }
}

function saveStats() {
  localStorage.setItem('crydex-progress', JSON.stringify(state.stats));
  renderProgress();
}

async function fetchPokemon(id) {
  if (state.cache.has(id)) return state.cache.get(id);
  const response = await fetch(`${API}/pokemon/${id}`);
  if (!response.ok) throw new Error('Pokémon data could not be loaded.');
  const data = await response.json();
  const pokemon = {
    id: data.id,
    name: titleCase(data.name),
    rawName: data.name,
    cry: data.cries?.latest || data.cries?.legacy,
    image: data.sprites?.other?.['official-artwork']?.front_default || ART(data.id),
    sprite: data.sprites?.front_default || MINI(data.id),
    types: data.types.map(item => item.type.name),
    height: data.height,
    weight: data.weight
  };
  state.cache.set(id, pokemon);
  return pokemon;
}

async function loadPokemonList() {
  try {
    const response = await fetch(`${API}/pokemon-species?limit=2000&offset=0`);
    if (!response.ok) throw new Error();
    const data = await response.json();
    state.list = data.results.map(item => {
      const id = Number(item.url.match(/\/pokemon-species\/(\d+)\/$/)?.[1]);
      return { id, name: titleCase(item.name), rawName: item.name };
    }).filter(item => item.id);
  } catch {
    state.list = Array.from({ length: 1025 }, (_, i) => ({ id: i + 1, name: `Pokémon #${pad(i + 1)}`, rawName: '' }));
    showToast('Live Pokédex names unavailable. Check your connection.');
  }
  renderLibrary();
  renderHelperOptions();
}

function renderHelperOptions() {
  const select = $('#helperSelect');
  if (!select) return;
  const found = state.stats.identified.map(id => state.list.find(item => item.id === id)).filter(Boolean);
  select.innerHTML = found.length
    ? '<option value="">Standard cursor</option>' + found.map(item => `<option value="${item.id}">${item.name}</option>`).join('')
    : '<option value="">Identify a Pokémon to unlock cursors</option>';
  select.disabled = !found.length;
  if (state.helperId && found.some(item => item.id === state.helperId)) select.value = String(state.helperId);
}

function randomIds(count, generation = state.generation, exclude = []) {
  const dynamicMax = state.list.length ? Math.max(...state.list.map(item => item.id)) : GEN_RANGES.all[1];
  const [min, max] = generation === 'all' ? [1, dynamicMax] : (GEN_RANGES[generation] || GEN_RANGES.all);
  const pool = Array.from({ length: max - min + 1 }, (_, index) => index + min).filter(id => !exclude.includes(id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

async function newQuestion(reset = false, autoStart = false) {
  stopCurrentAudioUI();
  document.body.classList.remove('hunt-active');
  if (reset) { state.round = 1; state.score = 0; }
  $('#sessionComplete').hidden = true;
  $('#practiceStage').hidden = false;
  state.answered = false;
  state.huntPhase = 'loading';
  $('#answerGrid').classList.remove('is-judged');
  $('#answerZone').hidden = true;
  $('#revealPanel').hidden = true;
  $('#huntDeck').hidden = false;
  $('#huntIntro').hidden = false;
  $('#huntHud').hidden = true;
  $('#foundBurst').hidden = true;
  $('#scannerDot').classList.remove('is-active');
  $('#startHunt').disabled = true;
  $('#startHunt').textContent = 'Tuning radar…';
  $('#huntState').textContent = 'TUNING';
  $('#practiceStatus').textContent = '';
  $('#answerGrid').innerHTML = '<div class="answer-skeleton"></div>'.repeat(4);
  $('#roundLabel').textContent = `Find ${state.round} of ${state.rounds}`;
  $('#roundProgress').style.transform = `scaleX(${state.round / state.rounds})`;
  $('#sessionScore').textContent = state.score;
  try {
    const ids = randomIds(4);
    const pokemon = await Promise.all(ids.map(fetchPokemon));
    state.current = pokemon[0];
    state.choices = pokemon.sort(() => Math.random() - .5);
    state.huntTarget = { x: .12 + Math.random() * .76, y: .18 + Math.random() * .68 };
    state.pointer = { x: .5, y: .5 };
    state.proximity = 0;
    state.proximityBand = 0;
    state.huntPhase = 'ready';
    $('#huntSerial').textContent = 'POKÉ RADAR / SIGNAL ????';
    $('#huntState').textContent = 'READY';
    $('#startHunt').disabled = false;
    $('#startHunt').textContent = 'Start searching';
    renderHelperOptions();
    renderAnswers();
    setAudio(state.current.cry);
    if (autoStart) startHunt();
  } catch (error) {
    $('#answerGrid').innerHTML = `<div class="empty-recent">Couldn’t tune into the Pokédex. Check your connection and try again.</div>`;
    $('#practiceStatus').innerHTML = '<button class="secondary-button" id="retryQuiz">Try again</button>';
    $('#retryQuiz')?.addEventListener('click', () => newQuestion(reset, autoStart));
  }
}

function renderAnswers() {
  $('#answerGrid').innerHTML = state.choices.map((pokemon, index) => `
    <button class="answer-button answer-dock" data-id="${pokemon.id}" style="--answer-index:${index}">
      <span class="answer-main">
        <span class="answer-identity"><strong title="${pokemon.name}">${pokemon.name}</strong></span>
      </span>
      <svg class="answer-check" aria-hidden="true" viewBox="0 0 24 24"><path d="m6 12 4 4 8-9"/></svg>
    </button>`).join('');
  $$('.answer-button').forEach(button => button.addEventListener('click', () => answerQuestion(Number(button.dataset.id))));
}

function setAudio(url) {
  state.audio.pause();
  state.audio.src = url || '';
  state.audio.load();
}

function stopCurrentAudioUI() {
  clearTimeout(state.huntTimer);
  state.audio.pause();
  state.huntTimer = null;
}

async function playHuntCry(manual = false) {
  if (!state.soundOn) { showToast('Turn sound on to hear the cry.'); return; }
  if (!state.current?.cry) { showToast('This cry is unavailable.'); return; }
  try {
    if (state.audio.src !== state.current.cry) setAudio(state.current.cry);
    state.audio.currentTime = 0;
    const profile = getProximityProfile(state.proximity);
    state.audio.volume = manual ? Math.max(.55, profile.volume) : profile.volume;
    state.audio.playbackRate = profile.rate;
    await state.audio.play();
  } catch { showToast('Audio could not play. Tap again or check your connection.'); }
}

async function playQuizCry() {
  if (!state.soundOn) { showToast('Turn sound on to hear the cry.'); return; }
  if (!state.current?.cry) { showToast('This cry is unavailable.'); return; }
  try {
    if (state.audio.src !== state.current.cry) setAudio(state.current.cry);
    state.audio.currentTime = 0;
    state.audio.volume = .9;
    state.audio.playbackRate = 1;
    await state.audio.play();
  } catch { showToast('The cry could not be replayed.'); }
}

function queueHuntCry(delay = 0) {
  clearTimeout(state.huntTimer);
  if (state.huntPhase !== 'hunting') return;
  state.huntTimer = setTimeout(async () => {
    if (state.huntPhase !== 'hunting') return;
    await playHuntCry();
    queueHuntCry(getProximityProfile(state.proximity).interval);
  }, delay);
}

function startHunt() {
  if (state.huntPhase !== 'ready') return;
  state.huntPhase = 'hunting';
  document.body.classList.add('hunt-active');
  $('#huntIntro').hidden = true;
  $('#huntHud').hidden = false;
  $('#huntState').textContent = 'LIVE';
  $('#huntField').classList.add('is-hunting');
  $('#huntField').focus({ preventScroll: true });
  updateProximity(.5, .5);
  state.stats.heard += 1;
  saveStats();
  const helper = state.helperId && state.stats.identified.includes(state.helperId);
  const cursorPokemon = $('#cursorPokemon');
  $('#scannerDot').classList.toggle('has-pokemon', Boolean(helper));
  $('#huntField').classList.toggle('has-pokemon-cursor', Boolean(helper));
  if (helper) {
    cursorPokemon.src = MINI(state.helperId);
    cursorPokemon.alt = state.list.find(item => item.id === state.helperId)?.name || 'Pokémon cursor';
  } else {
    cursorPokemon.removeAttribute('src');
    cursorPokemon.alt = '';
  }
  playHuntCry().finally(() => queueHuntCry(getProximityProfile(state.proximity).interval));
}

function updateProximity(x, y) {
  if (state.huntPhase !== 'hunting') return;
  state.pointer = { x, y };
  const distance = Math.hypot(x - state.huntTarget.x, y - state.huntTarget.y) / Math.SQRT2;
  const previousBand = state.proximityBand;
  state.proximity = Math.max(0, Math.min(1, 1 - distance / .72));
  const profile = getProximityProfile(state.proximity);
  state.proximityBand = Math.floor(state.proximity * 20);
  $('#proximityLabel').textContent = profile.label;
  const lit = profile.level;
  $$('#signalBars i').forEach((bar, index) => bar.classList.toggle('is-lit', index < lit));
  $('#huntField').classList.remove('range-0', 'range-1', 'range-2', 'range-3', 'range-4');
  $('#huntField').classList.add(`range-${lit - 1}`);
  $('#scannerDot').style.left = `${x * 100}%`;
  $('#scannerDot').style.top = `${y * 100}%`;
  $('#scannerDot').classList.add('is-active');
  if (state.proximityBand > previousBand) queueHuntCry(Math.max(60, profile.interval * .25));
}

function playFoundCue() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    const now = context.currentTime;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, now + index * .09);
      gain.gain.exponentialRampToValueAtTime(.11, now + index * .09 + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, now + index * .09 + .12);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + index * .09);
      oscillator.stop(now + index * .09 + .13);
    });
    setTimeout(() => context.close(), 600);
  } catch { /* The full-volume cry remains the confirmation fallback. */ }
}

function playPokedexSound(opening = true) {
  if (!state.soundOn) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    const now = context.currentTime;
    const notes = opening ? [293.66, 523.25, 783.99] : [783.99, 493.88, 293.66];
    const offsets = opening ? [0, .11, .24] : [0, .08, .18];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const offset = offsets[index];
      oscillator.type = index === 0 ? 'square' : index === 1 ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, now + offset);
      gain.gain.setValueAtTime(.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(index === 0 ? .032 : .05, now + offset + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, now + offset + .12);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + .13);
    });
    setTimeout(() => context.close(), 650);
  } catch { /* Opening remains fully usable when Web Audio is unavailable. */ }
}

function handleHuntPointer(event) {
  const rect = $('#huntField').getBoundingClientRect();
  updateProximity(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)));
}

function tryFindPokemon(event) {
  if (state.huntPhase !== 'hunting') return;
  handleHuntPointer(event);
  if (state.proximity < .95) {
    showToast(state.proximity > .8 ? 'Almost there—the fastest cry marks the spot.' : 'Nothing here. Keep listening.');
    return;
  }
  state.huntPhase = 'found';
  stopCurrentAudioUI();
  state.proximity = 1;
  playHuntCry(true);
  playFoundCue();
  $('#huntState').textContent = 'FOUND';
  $('#huntField').classList.add('is-found');
  $('#foundBurst').style.left = `${state.huntTarget.x * 100}%`;
  $('#foundBurst').style.top = `${state.huntTarget.y * 100}%`;
  $('#foundSprite').src = state.current.image;
  $('#quizSilhouette').src = state.current.image;
  $('#foundBurst').hidden = false;
  state.stats.discovered = [state.current.id, ...state.stats.discovered.filter(item => item !== state.current.id)];
  saveStats();
  renderHelperOptions();
  setTimeout(() => {
    document.body.classList.remove('hunt-active');
    $('#huntField').classList.remove('is-hunting', 'is-found');
    $('#huntDeck').hidden = true;
    $('#answerZone').hidden = false;
    $('#answerZone').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
  }, reducedMotion.matches ? 0 : 650);
}

function answerQuestion(id) {
  if (state.answered || !state.current) return;
  state.answered = true;
  const correct = id === state.current.id;
  state.stats.answered += 1;
  $('#answerGrid').classList.add('is-judged');
  $$('.answer-button').forEach(button => {
    button.disabled = true;
    const buttonId = Number(button.dataset.id);
    if (correct && buttonId === state.current.id) button.classList.add('correct');
    else if (buttonId === id) button.classList.add('wrong');
    if (buttonId === id) button.classList.add('is-selected');
  });
  if (correct) {
    state.score += 100;
    state.stats.correct += 1;
    state.stats.currentStreak += 1;
    state.stats.bestStreak = Math.max(state.stats.bestStreak, state.stats.currentStreak);
    state.stats.identified = [state.current.id, ...state.stats.identified.filter(item => item !== state.current.id)];
  } else {
    state.stats.currentStreak = 0;
  }
  $('#sessionScore').textContent = state.score;
  updateDailyStreak();
  saveStats();
  showReveal(correct);
}

function updateDailyStreak() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.stats.lastDay !== today) state.stats.lastDay = today;
}

function showReveal(correct) {
  $('#revealNumber').textContent = correct ? `#${pad(state.current.id)}` : '#????';
  $('#revealImage').src = state.current.image;
  $('#revealImage').alt = correct ? `${state.current.name} official artwork` : 'Unidentified Pokémon silhouette';
  $('#revealImage').classList.toggle('is-silhouette', !correct);
  $('#resultPill').textContent = correct ? 'Correct' : 'Not identified';
  $('#resultPill').classList.toggle('is-wrong', !correct);
  $('#revealName').textContent = correct ? state.current.name : 'Unknown Pokémon';
  $('#revealMeta').textContent = correct ? `${state.current.types.join(' / ')} type · ${state.current.height / 10} m tall` : 'Its silhouette was recorded. Identify it correctly in a future hunt to reveal this entry.';
  $('.dex-unlock').textContent = correct ? 'Pokédex entry revealed' : 'Silhouette recorded';
  $('#makeCompanion').hidden = !correct;
  $('#makeCompanion').textContent = `Use ${state.current.name} as cursor`;
  $('#makeCompanion').classList.toggle('is-selected', state.helperId === state.current.id);
  $('#nextQuestion').innerHTML = state.round >= state.rounds ? 'Finish session' : 'Find another <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11m-4-4 4 4-4 4"/></svg>';
  $('#revealPanel').hidden = false;
  $('#revealPanel').classList.remove('is-scanning-in');
  void $('#revealPanel').offsetWidth;
  $('#revealPanel').classList.add('is-scanning-in');
  $('#revealPanel').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
}

function nextQuestion() {
  if (state.round >= state.rounds) {
    finishSession();
  } else {
    state.round += 1;
    newQuestion(false, true);
  }
}

function finishSession() {
  stopCurrentAudioUI();
  $('#practiceStage').hidden = true;
  $('#completeScore').textContent = `${state.score / 100} / ${state.rounds}`;
  $('#completeMessage').textContent = state.score >= 800 ? 'Excellent ear. Those cries are becoming second nature.' : state.score >= 500 ? 'Nice listening. Another round will lock them in.' : 'Every replay sharpens your ear. Keep exploring the sound library.';
  $('#sessionComplete').hidden = false;
  $('#sessionComplete').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
}

function switchView(view) {
  const current = $('[data-view-panel]:not([hidden])')?.dataset.viewPanel;
  if (current === view) return;
  if (current === 'practice' && view !== 'practice') {
    stopCurrentAudioUI();
    document.body.classList.remove('hunt-active');
  }
  const applyView = () => {
    $$('[data-view-panel]').forEach(panel => { panel.hidden = panel.dataset.viewPanel !== view; panel.classList.toggle('is-active', panel.dataset.viewPanel === view); });
    $$('[data-view]').forEach(button => button.classList.toggle('is-active', button.dataset.view === view));
    history.replaceState(null, '', `#${view}`);
    if (view === 'library') renderLibrary();
    if (view === 'practice' && state.huntPhase === 'hunting') newQuestion();
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  applyView();
  const panel = $(`[data-view-panel="${view}"]`);
  panel?.classList.remove('is-view-entering');
  void panel?.offsetWidth;
  panel?.classList.add('is-view-entering');
  if (view === 'library') playPokedexSound(true);
}

function closePokedex() {
  const panel = $('#libraryView');
  if (panel.hidden || panel.classList.contains('is-closing')) return;
  panel.classList.remove('is-view-entering');
  panel.classList.add('is-closing');
  playPokedexSound(false);
  setTimeout(() => {
    panel.classList.remove('is-closing');
    switchView('practice');
  }, reducedMotion.matches ? 0 : 360);
}

function getFilteredList() {
  const query = ($('#searchInput')?.value || '').trim().toLowerCase();
  const generation = $('#libraryGeneration')?.value || 'all';
  const dynamicMax = state.list.length ? Math.max(...state.list.map(item => item.id)) : GEN_RANGES.all[1];
  const [min, max] = generation === 'all' ? [1, dynamicMax] : (GEN_RANGES[generation] || GEN_RANGES.all);
  return state.list.filter(item => item.id >= min && item.id <= max && (!query || item.name.toLowerCase().includes(query) || String(item.id) === query.replace(/^#/, '')));
}

function renderLibrary() {
  if (!$('#pokemonList')) return;
  const list = getFilteredList();
  const visible = list.slice(0, state.libraryLimit);
  $('#libraryCount').textContent = `${state.stats.discovered.length.toLocaleString()} found · ${list.length.toLocaleString()} shown`;
  $('#dexFoundDisplay').textContent = String(state.stats.discovered.length).padStart(3, '0');
  $('#pokemonList').innerHTML = visible.length ? visible.map(item => {
    const found = state.stats.discovered.includes(item.id);
    const identified = state.stats.identified.includes(item.id);
    const entryState = identified ? 'is-identified' : found ? 'is-located' : 'is-unfound';
    return `
    <article class="pokemon-row ${entryState}">
      <span class="pokemon-id">#${pad(item.id)}</span>
      ${identified ? `<img class="dex-sprite" src="${MINI(item.id)}" alt="${item.name}" loading="lazy" />` : `<span class="dex-question" aria-label="${found ? 'Found but not identified' : 'Pokémon not found'}">?</span>`}
      <div><div class="pokemon-name">${identified ? item.name : found ? 'Unidentified Pokémon' : 'Unknown'}</div><span class="mastery-mark">${identified ? 'Identified' : found ? 'Found · identity unknown' : 'Not found'}</span></div>
      ${identified ? `<button class="companion-pick ${state.helperId === item.id ? 'is-selected' : ''}" data-companion="${item.id}" aria-label="Use ${item.name} as the pointer cursor">${state.helperId === item.id ? 'Cursor' : 'Use cursor'}</button><button class="row-play" data-play-id="${item.id}" aria-label="Play ${item.name} cry"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 6v12l10-6L9 6Z"/></svg></button>` : found ? '<button class="companion-pick" disabled title="Identify this Pokémon correctly to reveal it">Identify first</button><span></span>' : '<span class="dex-lock" aria-label="Locked">?</span><span></span>'}
    </article>`;
  }).join('') : '<div class="empty-recent">No Pokémon match that search.</div>';
  $('#loadMore').hidden = visible.length >= list.length;
  $$('[data-play-id]').forEach(button => button.addEventListener('click', () => playLibraryPokemon(Number(button.dataset.playId), button)));
  $$('[data-companion]').forEach(button => button.addEventListener('click', () => chooseCompanion(Number(button.dataset.companion))));
}

function chooseCompanion(id) {
  if (!state.stats.identified.includes(id)) return;
  state.helperId = id;
  state.stats.helperId = id;
  saveStats();
  renderHelperOptions();
  renderLibrary();
  const name = state.list.find(item => item.id === id)?.name || 'Pokémon';
  showToast(`${name} is now your cursor. It gives no location hints.`);
}

async function playLibraryPokemon(id, button) {
  if (!state.soundOn) { showToast('Turn sound on to hear the cry.'); return; }
  const original = button.innerHTML;
  button.innerHTML = '<span class="inline-loader" aria-hidden="true"></span>';
  try {
    const pokemon = await fetchPokemon(id);
    if (!pokemon.cry) throw new Error();
    state.audio.pause();
    state.audio.src = pokemon.cry;
    await state.audio.play();
    state.stats.heard += 1;
    saveStats();
    showToast(`Playing ${pokemon.name}`);
  } catch { showToast('That cry could not be played.'); }
  finally { button.innerHTML = original; }
}

function toggleFavorite(id) {
  state.stats.favorites = state.stats.favorites.includes(id) ? state.stats.favorites.filter(item => item !== id) : [...state.stats.favorites, id];
  saveStats();
  renderLibrary();
}

function renderProgress() {}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('is-visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('is-visible'), 2600);
}

function bindEvents() {
  $$('[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
  $$('[data-go-practice]').forEach(button => button.addEventListener('click', () => switchView('practice')));
  $('#startHunt').addEventListener('click', event => { event.stopPropagation(); startHunt(); });
  $('#replayCry').addEventListener('click', event => { event.stopPropagation(); playHuntCry(true); });
  $('#quizReplay').addEventListener('click', playQuizCry);
  $('#helperSelect').addEventListener('change', event => {
    const id = Number(event.target.value) || null;
    if (id) chooseCompanion(id);
    else {
      state.helperId = null;
      state.stats.helperId = null;
      saveStats();
      renderHelperOptions();
      renderLibrary();
    }
  });
  $('#huntField').addEventListener('pointermove', handleHuntPointer);
  $('#huntField').addEventListener('click', tryFindPokemon);
  $('#nextQuestion').addEventListener('click', nextQuestion);
  $('#makeCompanion').addEventListener('click', () => {
    if (!state.current) return;
    chooseCompanion(state.current.id);
    $('#makeCompanion').classList.add('is-selected');
    $('#makeCompanion').textContent = `${state.current.name} is your cursor`;
  });
  $('#practiceAgain').addEventListener('click', () => newQuestion(true));
  $('#generationSelect').addEventListener('change', event => { state.generation = event.target.value; newQuestion(true); });
  $('#soundToggle').addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    $('#soundToggle').setAttribute('aria-pressed', String(state.soundOn));
    $('#soundToggle').setAttribute('aria-label', `Sound is ${state.soundOn ? 'on' : 'off'}`);
    if (!state.soundOn) {
      state.audio.pause();
      clearTimeout(state.huntTimer);
    } else if (state.huntPhase === 'hunting') {
      queueHuntCry(0);
    }
  });
  $('#searchInput').addEventListener('input', () => { state.libraryLimit = 40; renderLibrary(); });
  $('#libraryGeneration').addEventListener('change', () => { state.libraryLimit = 40; renderLibrary(); });
  $('#loadMore').addEventListener('click', () => { state.libraryLimit += 40; renderLibrary(); });
  $('#closePokedex').addEventListener('click', closePokedex);
  $('#libraryView').addEventListener('click', event => {
    if (event.target === $('#libraryView')) closePokedex();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('#libraryView').hidden) { closePokedex(); return; }
    if (event.target.matches('input, select, button')) return;
    if (event.code === 'Space' && !$('#practiceView').hidden && state.huntPhase === 'hunting') { event.preventDefault(); playHuntCry(true); }
  });
}

async function init() {
  state.helperId = state.stats.helperId || null;
  if (state.helperId && !state.stats.identified.includes(state.helperId)) {
    state.helperId = null;
    state.stats.helperId = null;
    saveStats();
  }
  bindEvents();
  renderProgress();
  const route = location.hash.replace('#', '');
  if (['practice','library'].includes(route)) switchView(route);
  await Promise.all([loadPokemonList(), newQuestion(true)]);
}

init();
