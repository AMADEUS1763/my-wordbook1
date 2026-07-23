class CSATVocabApp {
  constructor() {
    // State initialization
    this.storageKey = "csat_vocab_state_v1";
    this.state = this.loadState();
    
    // Combined word list (default + custom)
    this.words = [...CSAT_WORDS, ...this.state.customWords];
    
    // Flashcard state
    this.currentDeck = [];
    this.flashcardIndex = 0;
    this.isCardFlipped = false;
    this.autoPlayInterval = null;
    this.isAutoPlaying = false;

    // Quiz state
    this.quizQueue = [];
    this.quizCurrentIdx = 0;
    this.quizScore = 0;
    this.quizAnswered = false;

    // Active view
    this.activeView = "dashboard";

    this.init();
  }

  // Load state from localStorage
  loadState() {
    const saved = localStorage.getItem(this.storageKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse local storage state", e);
      }
    }
    return {
      knownWords: [],    // IDs of words marked as known
      wrongWords: [],    // IDs of words marked as unknown or quiz missed
      starredWords: [],  // IDs of starred words
      customWords: [],   // User added custom word objects
      quizStats: { total: 0, correct: 0 }
    };
  }

  saveState() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    this.updateDashboard();
  }

  resetAllProgress() {
    if (confirm("모든 학습 기록(아는 단어, 오답노트, 중요 표시, 퀴즈 점수 등)을 초기화하시겠습니까?")) {
      localStorage.removeItem(this.storageKey);
      this.state = {
        knownWords: [],
        wrongWords: [],
        starredWords: [],
        customWords: [],
        quizStats: { total: 0, correct: 0 }
      };
      this.words = [...CSAT_WORDS];
      this.updateDashboard();
      this.renderWordbook();
      this.renderIncorrectNotes();
      if (this.activeView === "flashcards") {
        this.initFlashcardDeck("infinite");
      }
      alert("모든 학습 기록이 초기화되었습니다! 처음부터 새롭게 시작해 보세요.");
    }
  }

  init() {
    // Set up tab navigation
    document.querySelectorAll(".nav-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const view = tab.getAttribute("data-view");
        this.switchView(view);
      });
    });

    // Keyboard shortcuts for flashcard study
    document.addEventListener("keydown", (e) => {
      if (this.activeView !== "flashcards") return;
      if (document.querySelector("input:focus") || document.querySelector("select:focus")) return;

      if (e.code === "Space") {
        e.preventDefault();
        this.flipCard();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        this.markCurrentWord(false);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        this.markCurrentWord(true);
      }
    });

    // Mobile Touch Swipe Gesture Support
    this.setupMobileTouchGestures();

    // Initialize decks and dashboard
    this.updateDashboard();
    this.initFlashcardDeck("infinite");
    this.renderWordbook();
    this.renderIncorrectNotes();
  }

  setupMobileTouchGestures() {
    const cardEl = document.getElementById("flashcard-element");
    if (!cardEl) return;

    let startX = 0;
    let startY = 0;
    let distX = 0;
    let distY = 0;

    cardEl.addEventListener("touchstart", (e) => {
      if (this.activeView !== "flashcards") return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      distX = 0;
      distY = 0;
    }, { passive: true });

    cardEl.addEventListener("touchmove", (e) => {
      if (this.activeView !== "flashcards") return;
      const touch = e.touches[0];
      distX = touch.clientX - startX;
      distY = touch.clientY - startY;
    }, { passive: true });

    cardEl.addEventListener("touchend", () => {
      if (this.activeView !== "flashcards") return;
      // Horizontal swipe threshold: 60px
      if (Math.abs(distX) > 60 && Math.abs(distY) < 100) {
        if (distX > 0) {
          // Swipe Right -> Know
          this.markCurrentWord(true);
        } else {
          // Swipe Left -> Don't Know
          this.markCurrentWord(false);
        }
      }
    });
  }

  switchView(viewName) {
    this.activeView = viewName;
    document.querySelectorAll(".nav-tab").forEach(tab => {
      tab.classList.toggle("active", tab.getAttribute("data-view") === viewName);
    });

    document.querySelectorAll(".view-section").forEach(sec => {
      sec.classList.remove("active");
    });

    const targetSec = document.getElementById(`view-${viewName}`);
    if (targetSec) {
      targetSec.classList.add("active");
    }

    // Refresh views on switch
    if (viewName === "dashboard") {
      this.updateDashboard();
    } else if (viewName === "wordbook") {
      this.renderWordbook();
    } else if (viewName === "incorrect") {
      this.renderIncorrectNotes();
    } else if (viewName === "flashcards") {
      if (this.currentDeck.length === 0) {
        this.initFlashcardDeck("all");
      }
    }
  }

  // --- DASHBOARD LOGIC ---
  updateDashboard() {
    this.words = [...CSAT_WORDS, ...this.state.customWords];
    
    document.getElementById("stat-total").innerText = this.words.length;
    document.getElementById("stat-learned").innerText = this.state.knownWords.length;
    document.getElementById("stat-wrong").innerText = this.state.wrongWords.length;

    const stats = this.state.quizStats;
    const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    document.getElementById("stat-accuracy").innerText = `${accuracy}%`;

    // Update Theme Counts
    const countEbs = this.words.filter(w => w.category === "ebs").length;
    const countGichul = this.words.filter(w => w.category === "gichul").length;
    const countIdiom = this.words.filter(w => w.category === "idiom").length;
    const countTheme = this.words.filter(w => w.category === "theme").length;

    const elEbs = document.getElementById("cat-count-ebs");
    if (elEbs) elEbs.innerText = `${countEbs} 단어`;
    const elGichul = document.getElementById("cat-count-gichul");
    if (elGichul) elGichul.innerText = `${countGichul} 단어`;
    const elIdiom = document.getElementById("cat-count-idiom");
    if (elIdiom) elIdiom.innerText = `${countIdiom} 단어`;
    const elTheme = document.getElementById("cat-count-theme");
    if (elTheme) elTheme.innerText = `${countTheme} 단어`;

    // Render Dashboard Day Grid
    this.renderDashboardDayGrid();
    this.populateFlashcardDayOptions();
  }

  renderDashboardDayGrid() {
    const dayGrid = document.getElementById("dashboard-day-grid");
    if (!dayGrid) return;

    // Collect all unique days
    const days = [...new Set(CSAT_WORDS.map(w => w.day).filter(Boolean))].sort((a, b) => a - b);

    dayGrid.innerHTML = days.map(dayNum => {
      const dayWords = CSAT_WORDS.filter(w => w.day === dayNum);
      const learnedCount = dayWords.filter(w => this.state.knownWords.includes(w.id)).length;
      
      return `
        <div class="day-card" onclick="app.startFlashcards('day_${dayNum}')">
          <div class="day-title">Day ${dayNum < 10 ? '0' + dayNum : dayNum}</div>
          <div class="day-count">${learnedCount} / ${dayWords.length} 학습 완료</div>
        </div>
      `;
    }).join("");
  }

  populateFlashcardDayOptions() {
    const select = document.getElementById("flashcard-category-select");
    const optGroup = document.getElementById("flashcard-day-optgroup");
    if (!optGroup) return;

    const currentValue = select ? select.value : null;

    const days = [...new Set(CSAT_WORDS.map(w => w.day).filter(Boolean))].sort((a, b) => a - b);

    optGroup.innerHTML = days.map(dayNum => {
      const dayWords = CSAT_WORDS.filter(w => w.day === dayNum);
      return `<option value="day_${dayNum}">Day ${dayNum < 10 ? '0' + dayNum : dayNum} (${dayWords.length}단어)</option>`;
    }).join("");

    if (select && currentValue) {
      select.value = currentValue;
    }
  }

  startFlashcards(category) {
    this.switchView("flashcards");
    const select = document.getElementById("flashcard-category-select");
    if (select) select.value = category;
    this.initFlashcardDeck(category);
  }

  // --- FLASHCARD LOGIC ---
  onFlashcardCategoryChange(category) {
    this.initFlashcardDeck(category);
  }

  initFlashcardDeck(category) {
    this.words = [...CSAT_WORDS, ...this.state.customWords];
    this.currentCategory = category || "infinite";
    this.infiniteCount = 1;

    if (category === "infinite" || !category) {
      // Infinite pool mode: shuffle all words into an endless stream
      this.currentDeck = this.shuffleArray([...this.words]);
    } else if (category === "all") {
      this.currentDeck = [...this.words];
    } else if (category.startsWith("day_")) {
      const dayNum = parseInt(category.replace("day_", ""), 10);
      this.currentDeck = this.words.filter(w => w.day === dayNum);
    } else if (category === "starred") {
      this.currentDeck = this.words.filter(w => this.state.starredWords.includes(w.id));
    } else if (category === "custom") {
      this.currentDeck = this.words.filter(w => w.id.startsWith("custom_"));
    } else {
      this.currentDeck = this.words.filter(w => w.category === category);
    }

    // Shuffle deck for variety if not empty
    if (this.currentDeck.length > 0 && category !== "all") {
      this.currentDeck = this.shuffleArray([...this.currentDeck]);
    }

    this.flashcardIndex = 0;
    this.isCardFlipped = false;

    // Keep the select dropdown value in sync
    const select = document.getElementById("flashcard-category-select");
    if (select) {
      select.value = this.currentCategory;
    }

    this.renderCurrentFlashcard();
  }

  formatMeaning(meaningStr) {
    if (!meaningStr) return "";
    const parts = meaningStr.split('|').map(p => p.trim());
    return parts.map(part => {
      const match = part.match(/^\[(.*?)\]\s*(.*)/);
      if (match) {
        const pos = match[1];
        const text = match[2];
        let posClass = "pos-tag-other";
        if (pos === "동사") posClass = "pos-tag-v";
        else if (pos === "명사") posClass = "pos-tag-n";
        else if (pos === "형용사") posClass = "pos-tag-adj";
        else if (pos === "부사") posClass = "pos-tag-adv";
        return `<div class="meaning-item"><span class="pos-badge-inline ${posClass}">${pos}</span> ${text}</div>`;
      }
      return `<div class="meaning-item">${part}</div>`;
    }).join("");
  }

  renderCurrentFlashcard() {
    const cardEl = document.getElementById("flashcard-element");
    if (!cardEl) return;

    cardEl.classList.remove("is-flipped");
    this.isCardFlipped = false;

    const counter = document.getElementById("flashcard-progress-counter");
    if (this.currentDeck.length === 0) {
      if (counter) counter.innerText = "0 / 0";
      document.getElementById("card-front-word").innerText = "단어 없음";
      document.getElementById("card-back-meaning").innerText = "선택한 카테고리에 단어가 없습니다.";
      document.getElementById("card-back-example").innerText = "";
      document.getElementById("card-back-translation").innerText = "";
      document.getElementById("card-back-meta").innerHTML = "";
      return;
    }

    if (counter) {
      if (this.currentCategory === "infinite") {
        counter.innerText = `🔥 무한 학습: ${this.infiniteCount}번째 단어`;
      } else {
        counter.innerText = `${this.flashcardIndex + 1} / ${this.currentDeck.length}`;
      }
    }

    const item = this.currentDeck[this.flashcardIndex];

    // Front
    document.getElementById("card-front-category").innerText = (item.category || "CUSTOM").toUpperCase();
    document.getElementById("card-front-word").innerText = item.word;

    // Star icon state
    const starBtn = document.getElementById("card-star-btn");
    if (starBtn) {
      const isStarred = this.state.starredWords.includes(item.id);
      starBtn.classList.toggle("active", isStarred);
      starBtn.innerHTML = isStarred ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
    }

    // Back
    document.getElementById("card-back-category").innerText = (item.category || "CUSTOM").toUpperCase();
    document.getElementById("card-back-pos").innerText = item.pos || "";
    document.getElementById("card-back-meaning").innerHTML = this.formatMeaning(item.meaning);
    document.getElementById("card-back-example").innerText = item.example || "";
    document.getElementById("card-back-translation").innerText = item.translation || "";

    // Synonyms, Antonyms, and Irregular inflections
    const metaContainer = document.getElementById("card-back-meta");
    if (metaContainer) {
      let metaHtml = "";
      if (item.synonyms && item.synonyms.length > 0) {
        metaHtml += `<div class="meta-row"><span class="meta-label syn">유의어</span> ${item.synonyms.map(s => `<span class="meta-pill">${s}</span>`).join('')}</div>`;
      }
      if (item.antonyms && item.antonyms.length > 0) {
        metaHtml += `<div class="meta-row"><span class="meta-label ant">반의어</span> ${item.antonyms.map(a => `<span class="meta-pill">${a}</span>`).join('')}</div>`;
      }
      if (item.irregular) {
        metaHtml += `<div class="meta-row"><span class="meta-label inflect"><i class="fa-solid fa-triangle-exclamation"></i> 변형 주의</span> <span class="meta-pill-inflect">${item.irregular}</span></div>`;
      }
      metaContainer.innerHTML = metaHtml;
    }
  }

  flipCard() {
    if (this.currentDeck.length === 0) return;
    const cardEl = document.getElementById("flashcard-element");
    if (cardEl) {
      this.isCardFlipped = !this.isCardFlipped;
      cardEl.classList.toggle("is-flipped", this.isCardFlipped);
      
      // Auto-pronounce word when card is flipped to the back side (meaning)
      if (this.isCardFlipped) {
        this.speakCurrentWord();
      }
    }
  }

  markCurrentWord(knows) {
    if (this.currentDeck.length === 0) return;
    const item = this.currentDeck[this.flashcardIndex];

    if (knows) {
      if (!this.state.knownWords.includes(item.id)) {
        this.state.knownWords.push(item.id);
      }
      this.state.wrongWords = this.state.wrongWords.filter(id => id !== item.id);
    } else {
      if (!this.state.wrongWords.includes(item.id)) {
        this.state.wrongWords.push(item.id);
      }
    }

    this.saveState();

    if (this.currentCategory === "infinite") {
      this.infiniteCount++;
      this.flashcardIndex++;
      
      // If reaching near end of current deck, seamlessly append a newly reshuffled batch!
      if (this.flashcardIndex >= this.currentDeck.length - 2) {
        const nextBatch = this.shuffleArray([...this.words]);
        this.currentDeck = this.currentDeck.concat(nextBatch);
      }
      
      this.isCardFlipped = false;
      this.renderCurrentFlashcard();
    } else {
      // Fixed size category deck (e.g. Day, theme, starred, custom)
      if (this.flashcardIndex < this.currentDeck.length - 1) {
        this.flashcardIndex++;
        this.isCardFlipped = false;
        this.renderCurrentFlashcard();
      } else {
        // End of deck
        if (confirm("이 카테고리의 모든 단어 카드를 학습 완료했습니다!\n대시보드로 돌아가 다른 Day를 학습하시겠습니까?")) {
          this.switchView("dashboard");
        } else {
          // Restart current deck
          this.initFlashcardDeck(this.currentCategory);
        }
      }
    }
  }

  toggleStarCurrent() {
    if (this.currentDeck.length === 0) return;
    const item = this.currentDeck[this.flashcardIndex];
    this.toggleStarWord(item.id);
    this.renderCurrentFlashcard();
  }

  toggleStarWord(wordId) {
    if (this.state.starredWords.includes(wordId)) {
      this.state.starredWords = this.state.starredWords.filter(id => id !== wordId);
    } else {
      this.state.starredWords.push(wordId);
    }
    this.saveState();
    this.renderWordbook();
    this.renderIncorrectNotes();
  }

  speakCurrentWord() {
    if (this.currentDeck.length === 0) return;
    const item = this.currentDeck[this.flashcardIndex];
    this.speakWord(item.word);
  }

  speakWord(text) {
    if (!('speechSynthesis' in window)) {
      alert("이 브라우저는 음성 합성을 지원하지 않습니다.");
      return;
    }
    window.speechSynthesis.cancel(); // stop current audio
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  // --- QUIZ LOGIC ---
  startQuiz() {
    const cat = document.getElementById("quiz-cat-select").value;
    const mode = document.getElementById("quiz-mode-select").value;
    const count = parseInt(document.getElementById("quiz-count-select").value, 10);

    let candidates = [];
    if (cat === "all") {
      candidates = [...this.words];
    } else if (cat === "incorrect") {
      candidates = this.words.filter(w => this.state.wrongWords.includes(w.id));
    } else {
      candidates = this.words.filter(w => w.category === cat);
    }

    if (candidates.length < 4) {
      alert("퀴즈를 생성하기 위한 단어가 최소 4개 이상 필요합니다.");
      return;
    }

    // Shuffle and pick questions
    const shuffledCandidates = this.shuffleArray([...candidates]);
    const selected = shuffledCandidates.slice(0, Math.min(count, candidates.length));

    this.quizQueue = selected.map(wordObj => {
      // Pick 3 wrong choices from total word list
      const otherWords = this.words.filter(w => w.id !== wordObj.id);
      const wrongChoices = this.shuffleArray([...otherWords]).slice(0, 3);
      
      const choices = this.shuffleArray([wordObj, ...wrongChoices]);
      const correctIdx = choices.findIndex(c => c.id === wordObj.id);

      return {
        word: wordObj,
        mode: mode,
        choices: choices,
        correctIdx: correctIdx
      };
    });

    this.quizCurrentIdx = 0;
    this.quizScore = 0;
    this.quizAnswered = false;

    document.getElementById("quiz-setup-panel").style.display = "none";
    document.getElementById("quiz-result-panel").style.display = "none";
    document.getElementById("quiz-play-panel").style.display = "flex";

    this.renderQuizQuestion();
  }

  startIncorrectQuiz() {
    this.switchView("quiz");
    const catSelect = document.getElementById("quiz-cat-select");
    if (catSelect) catSelect.value = "incorrect";
    this.startQuiz();
  }

  renderQuizQuestion() {
    if (this.quizCurrentIdx >= this.quizQueue.length) {
      this.finishQuiz();
      return;
    }

    this.quizAnswered = false;
    const q = this.quizQueue[this.quizCurrentIdx];

    // Counter & Progress fill
    document.getElementById("quiz-step-counter").innerText = `문제 ${this.quizCurrentIdx + 1} / ${this.quizQueue.length}`;
    const fillPercent = ((this.quizCurrentIdx) / this.quizQueue.length) * 100;
    document.getElementById("quiz-progress-bar-fill").style.width = `${fillPercent}%`;

    // Question
    const hintEl = document.getElementById("quiz-question-type-hint");
    const targetEl = document.getElementById("quiz-question-target");

    if (q.mode === "en2kr") {
      hintEl.innerText = "다음 영어 단어의 올바른 한국어 뜻을 선택하세요:";
      targetEl.innerText = q.word.word;
    } else {
      hintEl.innerText = "다음 뜻에 해당하는 올바른 영어 단어를 선택하세요:";
      targetEl.innerText = q.word.meaning;
    }

    // Choices
    const choicesContainer = document.getElementById("quiz-choices-container");
    choicesContainer.innerHTML = "";

    q.choices.forEach((choice, idx) => {
      const btn = document.createElement("button");
      btn.className = "quiz-choice-btn";
      
      const choiceText = q.mode === "en2kr" ? choice.meaning : `${choice.word} (${choice.pos || ''})`;

      btn.innerHTML = `
        <span class="choice-num">${idx + 1}</span>
        <span>${choiceText}</span>
      `;

      btn.onclick = () => this.handleQuizAnswer(idx, btn);
      choicesContainer.appendChild(btn);
    });
  }

  handleQuizAnswer(chosenIdx, btnElement) {
    if (this.quizAnswered) return;
    this.quizAnswered = true;

    const q = this.quizQueue[this.quizCurrentIdx];
    const choicesBtns = document.querySelectorAll(".quiz-choice-btn");

    if (chosenIdx === q.correctIdx) {
      btnElement.classList.add("correct");
      this.quizScore++;
      // Do not automatically remove from wrongWords or add to knownWords when answered correctly,
      // as getting it correct once in a quiz does not guarantee absolute mastery.
    } else {
      btnElement.classList.add("incorrect");
      // Highlight correct one
      choicesBtns[q.correctIdx].classList.add("correct");
      // Add to wrongWords and remove from knownWords
      if (!this.state.wrongWords.includes(q.word.id)) {
        this.state.wrongWords.push(q.word.id);
      }
      this.state.knownWords = this.state.knownWords.filter(id => id !== q.word.id);
    }

    // Update global quiz statistics
    this.state.quizStats.total++;
    if (chosenIdx === q.correctIdx) {
      this.state.quizStats.correct++;
    }
    this.saveState();

    // Delay next question
    setTimeout(() => {
      this.quizCurrentIdx++;
      this.renderQuizQuestion();
    }, 1000);
  }

  cancelQuiz() {
    this.resetQuizUI();
  }

  resetQuizUI() {
    document.getElementById("quiz-play-panel").style.display = "none";
    document.getElementById("quiz-result-panel").style.display = "none";
    document.getElementById("quiz-setup-panel").style.display = "flex";
  }

  finishQuiz() {
    document.getElementById("quiz-play-panel").style.display = "none";
    const resultPanel = document.getElementById("quiz-result-panel");
    resultPanel.style.display = "block";

    const total = this.quizQueue.length;
    const pct = Math.round((this.quizScore / total) * 100);

    document.getElementById("quiz-final-score").innerText = `${pct}점`;
    document.getElementById("quiz-result-summary").innerText = `${total}문제 중 ${this.quizScore}문제를 맞히셨습니다.`;

    // Confetti on good score
    if (pct >= 80 && window.confetti) {
      window.confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }

  // --- WORDBOOK LOGIC ---
  renderWordbook() {
    const grid = document.getElementById("wordbook-grid");
    if (!grid) return;

    this.words = [...CSAT_WORDS, ...this.state.customWords];
    const searchTerm = (document.getElementById("word-search-input")?.value || "").toLowerCase().trim();
    const catFilter = document.getElementById("wordbook-category-filter")?.value || "all";

    let filtered = this.words.filter(w => {
      // Category match
      if (catFilter === "starred" && !this.state.starredWords.includes(w.id)) return false;
      if (catFilter === "custom" && !w.id.startsWith("custom_")) return false;
      if (catFilter !== "all" && catFilter !== "starred" && catFilter !== "custom" && w.category !== catFilter) return false;

      // Search match
      if (searchTerm) {
        const inWord = w.word.toLowerCase().includes(searchTerm);
        const inMeaning = w.meaning.toLowerCase().includes(searchTerm);
        const inSyn = w.synonyms && w.synonyms.some(s => s.toLowerCase().includes(searchTerm));
        const inAnt = w.antonyms && w.antonyms.some(a => a.toLowerCase().includes(searchTerm));
        return inWord || inMeaning || inSyn || inAnt;
      }
      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <div class="empty-icon"><i class="fa-solid fa-folder-open"></i></div>
          <p>조건에 일치하는 단어가 없습니다.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(w => {
      const isStarred = this.state.starredWords.includes(w.id);
      const isKnown = this.state.knownWords.includes(w.id);
      const isCustom = w.id.startsWith("custom_");

      let metaHtml = "";
      if (w.synonyms && w.synonyms.length > 0) {
        metaHtml += `<div class="meta-row" style="margin-top:0.4rem;"><span class="meta-label syn">유의어</span> ${w.synonyms.map(s => `<span class="meta-pill">${s}</span>`).join('')}</div>`;
      }
      if (w.antonyms && w.antonyms.length > 0) {
        metaHtml += `<div class="meta-row" style="margin-top:0.3rem;"><span class="meta-label ant">반의어</span> ${w.antonyms.map(a => `<span class="meta-pill">${a}</span>`).join('')}</div>`;
      }
      if (w.irregular) {
        metaHtml += `<div class="meta-row" style="margin-top:0.3rem;"><span class="meta-label inflect"><i class="fa-solid fa-triangle-exclamation"></i> 변형 주의</span> <span class="meta-pill-inflect">${w.irregular}</span></div>`;
      }

      return `
        <div class="word-card">
          <div>
            <div class="word-card-header">
              <div>
                <span class="word-card-title">${w.word}</span>
                <span class="word-card-pos">${w.pos || ''}</span>
              </div>
              <button class="star-btn ${isStarred ? 'active' : ''}" onclick="app.toggleStarWord('${w.id}')">
                <i class="${isStarred ? 'fa-solid' : 'fa-regular'} fa-star"></i>
              </button>
            </div>
            <div class="word-card-meaning">${this.formatMeaning(w.meaning)}</div>
            ${metaHtml}
            ${w.example ? `
              <div class="word-card-example" style="margin-top:0.5rem;">
                <div>${w.example}</div>
                <div style="color: var(--text-dim); font-size: 0.8rem; margin-top: 0.2rem;">${w.translation || ''}</div>
              </div>
            ` : ''}
          </div>

          <div class="word-card-footer">
            <button class="audio-btn" style="width: 32px; height: 32px; font-size: 0.85rem;" onclick="app.speakWord('${w.word}')">
              <i class="fa-solid fa-volume-high"></i>
            </button>
            
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              ${isCustom ? `
                <button style="background: none; border: none; color: var(--accent-error); cursor: pointer; font-size: 0.85rem;" onclick="app.deleteCustomWord('${w.id}')">
                  <i class="fa-solid fa-trash"></i> 삭제
                </button>
              ` : ''}
              <span style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; ${isKnown ? 'background: rgba(16,185,129,0.2); color:#34d399;' : 'background: rgba(255,255,255,0.05); color:var(--text-dim);'}">
                ${isKnown ? '학습완료' : '미학습'}
              </span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  // --- INCORRECT NOTES LOGIC ---
  renderIncorrectNotes() {
    const grid = document.getElementById("incorrect-grid");
    if (!grid) return;

    this.words = [...CSAT_WORDS, ...this.state.customWords];
    const wrongList = this.words.filter(w => this.state.wrongWords.includes(w.id));

    if (wrongList.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <div class="empty-icon" style="color: var(--accent-success);"><i class="fa-solid fa-circle-check"></i></div>
          <h3>복습할 오답 단어가 없습니다!</h3>
          <p>모든 단어를 완벽하게 마스터하셨거나 아직 오답이 등록되지 않았습니다.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = wrongList.map(w => {
      const isStarred = this.state.starredWords.includes(w.id);

      let metaHtml = "";
      if (w.synonyms && w.synonyms.length > 0) {
        metaHtml += `<div class="meta-row" style="margin-top:0.4rem;"><span class="meta-label syn">유의어</span> ${w.synonyms.map(s => `<span class="meta-pill">${s}</span>`).join('')}</div>`;
      }
      if (w.antonyms && w.antonyms.length > 0) {
        metaHtml += `<div class="meta-row" style="margin-top:0.3rem;"><span class="meta-label ant">반의어</span> ${w.antonyms.map(a => `<span class="meta-pill">${a}</span>`).join('')}</div>`;
      }
      if (w.irregular) {
        metaHtml += `<div class="meta-row" style="margin-top:0.3rem;"><span class="meta-label inflect"><i class="fa-solid fa-triangle-exclamation"></i> 변형 주의</span> <span class="meta-pill-inflect">${w.irregular}</span></div>`;
      }

      return `
        <div class="word-card" style="border-color: rgba(244, 63, 94, 0.3);">
          <div>
            <div class="word-card-header">
              <div>
                <span class="word-card-title">${w.word}</span>
                <span class="word-card-pos">${w.pos || ''}</span>
              </div>
              <button class="star-btn ${isStarred ? 'active' : ''}" onclick="app.toggleStarWord('${w.id}')">
                <i class="${isStarred ? 'fa-solid' : 'fa-regular'} fa-star"></i>
              </button>
            </div>
            <div class="word-card-meaning">${this.formatMeaning(w.meaning)}</div>
            ${metaHtml}
            ${w.example ? `
              <div class="word-card-example" style="margin-top:0.5rem;">
                <div>${w.example}</div>
                <div style="color: var(--text-dim); font-size: 0.8rem; margin-top: 0.2rem;">${w.translation || ''}</div>
              </div>
            ` : ''}
          </div>

          <div class="word-card-footer">
            <button class="audio-btn" style="width: 32px; height: 32px; font-size: 0.85rem;" onclick="app.speakWord('${w.word}')">
              <i class="fa-solid fa-volume-high"></i>
            </button>
            <button class="btn-action btn-know" style="padding: 0.3rem 0.8rem; font-size: 0.8rem;" onclick="app.removeFromIncorrect('${w.id}')">
              <i class="fa-solid fa-check"></i> 오답 노출 제거
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  removeFromIncorrect(wordId) {
    this.state.wrongWords = this.state.wrongWords.filter(id => id !== wordId);
    this.saveState();
    this.renderIncorrectNotes();
  }

  // --- CUSTOM WORD MODAL LOGIC ---
  openAddWordModal() {
    document.getElementById("add-word-modal").classList.add("active");
  }

  closeAddWordModal() {
    document.getElementById("add-word-modal").classList.remove("active");
    document.getElementById("add-word-form").reset();
  }

  handleAddWordSubmit(e) {
    e.preventDefault();

    const wordVal = document.getElementById("new-word-input").value.trim();
    const posVal = document.getElementById("new-pos-input").value.trim();
    const meaningVal = document.getElementById("new-meaning-input").value.trim();
    const exampleVal = document.getElementById("new-example-input").value.trim();
    const translationVal = document.getElementById("new-translation-input").value.trim();
    
    const synVal = (document.getElementById("new-synonyms-input")?.value || "").split(",").map(s => s.trim()).filter(Boolean);
    const antVal = (document.getElementById("new-antonyms-input")?.value || "").split(",").map(a => a.trim()).filter(Boolean);
    const irregularVal = document.getElementById("new-irregular-input")?.value.trim() || "";

    if (!wordVal || !meaningVal) return;

    const newObj = {
      id: "custom_" + Date.now(),
      word: wordVal,
      pos: posVal,
      meaning: meaningVal,
      example: exampleVal,
      translation: translationVal,
      synonyms: synVal,
      antonyms: antVal,
      irregular: irregularVal,
      category: "custom"
    };

    this.state.customWords.push(newObj);
    this.saveState();
    this.closeAddWordModal();
    this.renderWordbook();
    alert(`'${wordVal}' 단어가 성공적으로 추가되었습니다.`);
  }

  deleteCustomWord(wordId) {
    if (confirm("정말로 이 사용자 단어를 삭제하시겠습니까?")) {
      this.state.customWords = this.state.customWords.filter(w => w.id !== wordId);
      this.state.knownWords = this.state.knownWords.filter(id => id !== wordId);
      this.state.wrongWords = this.state.wrongWords.filter(id => id !== wordId);
      this.state.starredWords = this.state.starredWords.filter(id => id !== wordId);
      this.saveState();
      this.renderWordbook();
    }
  }

  // Utility: Fisher-Yates shuffle
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

// Global App instance launch
let app;
window.addEventListener("DOMContentLoaded", () => {
  app = new CSATVocabApp();
});
