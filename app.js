import { db } from './firebase-config.js';
import { 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc, 
    arrayUnion, 
    arrayRemove,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// State Management
let workoutPlans = [];
let selectedWorkoutId = null;
let activeWorkoutId = null; // The workout currently being performed
let activeWorkoutState = {}; // Tracks completed sets in activity tab
let restTime = 60;
let editingExerciseId = null; // Tracks which exercise is being edited


// PWA Installation
let deferredPrompt;

// Check if already installed
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallPromotion();
});

window.addEventListener('appinstalled', (evt) => {
    console.log('App was installed');
    hideInstallPromotion();
});

function showInstallPromotion() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) {
        hideInstallPromotion();
        return;
    }

    const installBtn = document.getElementById('install-btn');
    const installBtnSetup = document.getElementById('install-btn-setup');
    const installCard = document.getElementById('install-card');

    if (installBtn) installBtn.style.display = 'inline-flex';
    if (installCard) installCard.style.display = 'block';

    const handleInstallClick = () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    hideInstallPromotion();
                }
                deferredPrompt = null;
            });
        } else {
            // Manual instructions fallback
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            if (isIOS) {
                customAlert('התקנה באייפון: לחץ על כפתור השיתוף בתחתית הדפדפן (ריבוע עם חץ למעלה) ובחר ב-"הוסף למסך הבית".');
            } else {
                customAlert('להתקנת האפליקציה: לחץ על שלוש הנקודות בתפריט הדפדפן ובחר ב-"התקן אפליקציה" או "הוסף למסך הבית".');
            }
        }
    };

    if (installBtn) {
        const newBtn = installBtn.cloneNode(true);
        installBtn.parentNode.replaceChild(newBtn, installBtn);
        newBtn.addEventListener('click', handleInstallClick);
        elements.installBtn = newBtn;
    }

    if (installBtnSetup) {
        const newBtnSetup = installBtnSetup.cloneNode(true);
        installBtnSetup.parentNode.replaceChild(newBtnSetup, installBtnSetup);
        newBtnSetup.addEventListener('click', handleInstallClick);
    }
}

function hideInstallPromotion() {
    const installBtn = document.getElementById('install-btn');
    const installCard = document.getElementById('install-card');
    if (installBtn) installBtn.style.display = 'none';
    if (installCard) installCard.style.display = 'none';
}

// Fallback for iOS
function checkIOSInstallation(forceShowAlert = false) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    
    if (isIOS && !isStandalone) {
        if (forceShowAlert) {
            customAlert('התקנה באייפון: לחץ על כפתור השיתוף בתחתית הדפדפן (ריבוע עם חץ למעלה) ובחר ב-"הוסף למסך הבית".');
        } else {
            showInstallPromotion();
        }
    }
}

// DOM Elements Cache
const elements = {
    tabs: null,
    navBtns: null,
    setupTab: null,
    activityTab: null,
    historyTab: null,
    navSetup: null,
    navActivity: null,
    navHistory: null,
    currentPlanList: null,
    activeWorkoutContainer: null,
    historyList: null,
    timerWidget: null,
    timerCountdown: null,
    timerToggleBtn: null,
    installBtn: null,
    savePlanBtn: null,
    workoutActions: null,
    repsContainer: null,
    workoutsList: null,
    workoutEditorCard: null,
    workoutNameInput: null,
    editorTitle: null,
    miniTimer: null,
    miniTimerDisplay: null
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    // Cache all elements once
    elements.tabs = document.querySelectorAll('.tab-content');
    elements.navBtns = document.querySelectorAll('.nav-btn');
    elements.setupTab = document.getElementById('setup-tab');
    elements.activityTab = document.getElementById('activity-tab');
    elements.historyTab = document.getElementById('history-tab');
    elements.navSetup = document.getElementById('nav-setup');
    elements.navActivity = document.getElementById('nav-activity');
    elements.navHistory = document.getElementById('nav-history');
    elements.currentPlanList = document.getElementById('current-plan-list');
    elements.activeWorkoutContainer = document.getElementById('active-workout-container');
    elements.historyList = document.getElementById('history-list');
    elements.timerWidget = document.getElementById('timer-widget');
    elements.timerCountdown = document.getElementById('timer-countdown');
    elements.timerToggleBtn = document.getElementById('timer-toggle-btn');
    elements.installBtn = document.getElementById('install-btn');
    elements.savePlanBtn = document.getElementById('save-plan-btn');
    elements.workoutActions = document.getElementById('workout-actions');
    elements.repsContainer = document.getElementById('reps-inputs-container');
    elements.workoutsList = document.getElementById('workouts-list');
    elements.workoutEditorCard = document.getElementById('workout-editor-card');
    elements.workoutNameInput = document.getElementById('workout-name-input');
    elements.editorTitle = document.getElementById('editor-title');
    elements.miniTimer = document.getElementById('mini-timer');
    elements.miniTimerDisplay = document.getElementById('mini-timer-display');

    loadPlanFromStorage();
    renderWorkoutsList();
    renderCurrentPlan();
    renderActiveWorkout();
    
    // Initialize Drag and Drop for current plan list
    initDragAndDrop();

    // Initial check for installation status
    showInstallPromotion();

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.error('Service Worker registration failed', err));
    }
});

// Tab Switching (Optimized)
function switchTab(tabId) {
    // Hide all tabs and deactivate all buttons efficiently
    elements.tabs.forEach(tab => {
        if (tab.id === `${tabId}-tab`) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    elements.navBtns.forEach(btn => {
        if (btn.id === `nav-${tabId}`) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    if (tabId === 'activity') {
        renderActiveWorkout();
    } else if (tabId === 'history') {
        renderHistory();
    }
}

// Workout Plans Management
function renderWorkoutsList() {
    const list = elements.workoutsList;
    if (!list) return;

    if (workoutPlans.length === 0) {
        list.innerHTML = `
            <div class="empty-state" style="padding: 20px;">
                <p>עדיין לא נוצרו אימונים. לחץ על "אימון חדש" כדי להתחיל.</p>
            </div>
        `;
        return;
    }

    const fragment = document.createDocumentFragment();
    workoutPlans.forEach(plan => {
        const item = document.createElement('div');
        item.className = 'exercise-item'; // Reusing style
        item.dataset.planId = plan.id;
        if (selectedWorkoutId === plan.id) {
            item.style.borderColor = 'var(--accent-color)';
            item.style.background = 'rgba(56, 189, 248, 0.1)';
        }
        
        const info = document.createElement('div');
        info.className = 'exercise-info';
        info.innerHTML = `
            <h3>${plan.name || 'אימון ללא שם'}</h3>
            <p>${plan.exercises.length} תרגילים</p>
        `;
        info.onclick = () => selectWorkout(plan.id);
        info.style.cursor = 'pointer';
        info.style.flex = '1';

        const actions = document.createElement('div');
        actions.className = 'item-actions';
        
        const startBtn = document.createElement('button');
        startBtn.className = 'btn btn-success';
        startBtn.style.width = 'auto';
        startBtn.style.padding = '8px 12px';
        startBtn.style.fontSize = '14px';
        startBtn.innerHTML = '<i class="fa-solid fa-play"></i> התחל';
        startBtn.onclick = (e) => {
            e.stopPropagation();
            startWorkout(plan.id);
        };

        const editNameBtn = document.createElement('button');
        editNameBtn.className = 'edit-btn';
        editNameBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
        editNameBtn.title = 'ערוך שם';
        editNameBtn.onclick = (e) => {
            e.stopPropagation();
            renameWorkout(plan.id);
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'remove-btn';
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteWorkoutPlan(plan.id);
        };

        actions.appendChild(startBtn);
        actions.appendChild(editNameBtn);
        actions.appendChild(deleteBtn);
        
        item.appendChild(info);
        item.appendChild(actions);
        fragment.appendChild(item);
    });

    list.innerHTML = '';
    list.appendChild(fragment);
}

function createNewWorkout() {
    const newId = Date.now().toString();
    const newPlan = {
        id: newId,
        name: `אימון חדש ${workoutPlans.length + 1}`,
        exercises: []
    };
    workoutPlans.push(newPlan);
    saveAllPlans();
    selectWorkout(newId);
    renderWorkoutsList();
    
    // Focus on name input
    setTimeout(() => {
        elements.workoutNameInput.focus();
        elements.workoutNameInput.select();
    }, 100);
}

function selectWorkout(id) {
    selectedWorkoutId = id;
    const plan = workoutPlans.find(p => p.id === id);
    if (!plan) return;

    elements.workoutEditorCard.style.display = 'block';
    elements.workoutNameInput.value = plan.name || '';
    elements.editorTitle.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> עריכת: ${plan.name}`;
    
    renderWorkoutsList();
    renderCurrentPlan();
    
    // Scroll to editor
    elements.workoutEditorCard.scrollIntoView({ behavior: 'smooth' });
}

function updateWorkoutName() {
    if (!selectedWorkoutId) return;
    const plan = workoutPlans.find(p => p.id === selectedWorkoutId);
    if (plan) {
        plan.name = elements.workoutNameInput.value;
        elements.editorTitle.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> עריכת: ${plan.name || 'אימון ללא שם'}`;
        
        // Update the name in the list without re-rendering everything
        const listItems = elements.workoutsList.querySelectorAll('.exercise-item');
        const planItem = Array.from(listItems).find(item => {
            const info = item.querySelector('.exercise-info h3');
            return info && item.dataset.planId === plan.id;
        });
        
        if (planItem) {
            const h3 = planItem.querySelector('.exercise-info h3');
            if (h3) h3.innerText = plan.name || 'אימון ללא שם';
        }

        saveAllPlans();
    }
}

function renameWorkout(id) {
    const plan = workoutPlans.find(p => p.id === id);
    if (!plan) return;
    
    // Select the workout first
    selectWorkout(id);
    
    // Focus the name input
    setTimeout(() => {
        elements.workoutNameInput.focus();
        elements.workoutNameInput.select();
    }, 100);
}

function deleteWorkoutPlan(id) {
    customConfirm('האם אתה בטוח שברצונך למחוק אימון זה?', () => {
        workoutPlans = workoutPlans.filter(p => p.id !== id);
        if (selectedWorkoutId === id) {
            selectedWorkoutId = null;
            elements.workoutEditorCard.style.display = 'none';
        }
        if (activeWorkoutId === id) {
            activeWorkoutId = null;
            activeWorkoutState = {};
            localStorage.removeItem('fitbud_activity_state');
            localStorage.removeItem('fitbud_active_workout_id');
        }
        saveAllPlans();
        renderWorkoutsList();
        renderCurrentPlan();
    });
}

function startWorkout(id) {
    const plan = workoutPlans.find(p => p.id === id);
    if (!plan) return;

    if (plan.exercises.length === 0) {
        customAlert('לא ניתן להתחיל אימון ללא תרגילים. הוסף תרגילים קודם.');
        selectWorkout(id);
        return;
    }

    if (activeWorkoutId && activeWorkoutId !== id) {
        customConfirm('ישנו אימון פעיל אחר. האם ברצונך להפסיק אותו ולהתחיל את האימון הנוכחי?', () => {
            performStartWorkout(id);
        });
    } else {
        performStartWorkout(id);
    }
}

function performStartWorkout(id) {
    activeWorkoutId = id;
    activeWorkoutState = {}; // Reset state for new session
    localStorage.setItem('fitbud_active_workout_id', activeWorkoutId);
    localStorage.removeItem('fitbud_activity_state');
    
    renderActiveWorkout();
    switchTab('activity');
}

async function saveAllPlans() {
    localStorage.setItem('fitbud_plans', JSON.stringify(workoutPlans));
    
    // Sync to Firebase
    try {
        const userRef = doc(db, "users", "default_user");
        await setDoc(userRef, { 
            workoutPlans: workoutPlans,
            lastUpdated: new Date().toISOString()
        }, { merge: true });
        console.log("Plans synced to Firebase");
    } catch (e) {
        console.error("Error syncing to Firebase:", e);
    }
}

// Dynamic Rep Inputs Generation (Optimized with Fragment)
function generateRepInputs() {
    const setsCount = parseInt(document.getElementById('sets-count').value);
    const isSeparate = document.getElementById('separate-sets').checked;
    const container = elements.repsContainer;
    
    if (isNaN(setsCount) || setsCount <= 0) {
        container.innerHTML = '';
        return;
    }
    
    // Capture current values before clearing to preserve them
    let currentReps = '';
    let currentWeight = '';
    
    const globalRepsInput = document.getElementById('reps-set-global');
    const firstSetRepsInput = document.getElementById('reps-set-1');
    
    if (globalRepsInput) {
        currentReps = globalRepsInput.value;
        currentWeight = document.getElementById('weight-set-global').value;
    } else if (firstSetRepsInput) {
        currentReps = firstSetRepsInput.value;
        currentWeight = document.getElementById('weight-set-1').value;
    }
    
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    if (isSeparate) {
        for (let i = 1; i <= setsCount; i++) {
            const group = createRepInputGroup(i, `סט ${i} (חזרות)`);
            fragment.appendChild(group);
            
            // Re-apply values
            const repsInp = group.querySelector(`#reps-set-${i}`);
            const weightInp = group.querySelector(`#weight-set-${i}`);
            
            // If we came from global, use global values for all. 
            // If we were already in separate, we might need a more complex capture, 
            // but for a simple toggle, this is better than nothing.
            if (currentReps) repsInp.value = currentReps;
            if (currentWeight) weightInp.value = currentWeight;
        }
    } else {
        const group = createRepInputGroup('global', 'כל הסטים (חזרות)');
        fragment.appendChild(group);
        if (currentReps) group.querySelector('#reps-set-global').value = currentReps;
        if (currentWeight) group.querySelector('#weight-set-global').value = currentWeight;
    }
    container.appendChild(fragment);
}

function createRepInputGroup(idSuffix, labelText) {
    const group = document.createElement('div');
    group.className = 'rep-input-group';
    group.style.display = 'flex';
    group.style.gap = '15px';
    group.style.width = '100%';
    
    const repsDiv = document.createElement('div');
    repsDiv.style.flex = '1';
    const repsLabel = document.createElement('label');
    repsLabel.innerText = labelText;
    const repsInput = document.createElement('input');
    repsInput.type = 'number';
    repsInput.min = '1';
    repsInput.placeholder = '10';
    repsInput.required = true;
    repsInput.id = `reps-set-${idSuffix}`;
    repsDiv.appendChild(repsLabel);
    repsDiv.appendChild(repsInput);
    
    const weightDiv = document.createElement('div');
    weightDiv.style.flex = '1';
    const weightLabel = document.createElement('label');
    weightLabel.innerText = `משקל (ק"ג)`;
    const weightInput = document.createElement('input');
    weightInput.type = 'number';
    weightInput.min = '0';
    weightInput.step = '0.5';
    weightInput.placeholder = '0';
    weightInput.required = true;
    weightInput.id = `weight-set-${idSuffix}`;
    weightDiv.appendChild(weightLabel);
    weightDiv.appendChild(weightInput);
    
    group.appendChild(repsDiv);
    group.appendChild(weightDiv);
    return group;
}

// Add or Update Exercise in Plan
function addExercise() {
    const nameInput = document.getElementById('exercise-name');
    const setsInput = document.getElementById('sets-count');
    const addBtn = document.getElementById('add-exercise-btn');
    
    const name = nameInput.value.trim();
    const setsCount = parseInt(setsInput.value);
    
    if (!name || isNaN(setsCount) || setsCount <= 0) return;
    
    const sets = [];
    const isSeparate = document.getElementById('separate-sets').checked;
    
    if (isSeparate) {
        for (let i = 1; i <= setsCount; i++) {
            const repInput = document.getElementById(`reps-set-${i}`);
            const weightInput = document.getElementById(`weight-set-${i}`);
            if (repInput && weightInput) {
                sets.push({
                    reps: parseInt(repInput.value) || 10,
                    weight: parseFloat(weightInput.value) || 0
                });
            }
        }
    } else {
        const repInput = document.getElementById(`reps-set-global`);
        const weightInput = document.getElementById(`weight-set-global`);
        const reps = parseInt(repInput.value) || 10;
        const weight = parseFloat(weightInput.value) || 0;
        for (let i = 0; i < setsCount; i++) {
            sets.push({ reps, weight });
        }
    }
    
    const plan = workoutPlans.find(p => p.id === selectedWorkoutId);
    if (!plan) return;
    const currentExercises = plan.exercises;

    if (editingExerciseId) {
        // Update existing exercise
        const index = currentExercises.findIndex(ex => ex.id === editingExerciseId);
        if (index !== -1) {
            currentExercises[index] = {
                ...currentExercises[index],
                name: name,
                sets: sets
            };
        }
        editingExerciseId = null;
        addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> הוסף תרגיל לאימון';
        
        // Remove cancel button if exists
        const cancelBtn = document.getElementById('cancel-edit-btn');
        if (cancelBtn) cancelBtn.remove();
    } else {
        // Add new exercise
        const exercise = {
            id: Date.now().toString(),
            name: name,
            sets: sets
        };
        currentExercises.push(exercise);
    }
    
    // Reset Form
    nameInput.value = '';
    setsInput.value = '';
    document.getElementById('reps-inputs-container').innerHTML = '';
    
    // Update UI
    renderCurrentPlan();
    renderWorkoutsList();
    document.getElementById('save-plan-btn').disabled = false;
    
    // Save to local storage
    saveAllPlans();
}

// Edit Exercise - Load into form
function editExercise(id) {
    const plan = workoutPlans.find(p => p.id === selectedWorkoutId);
    if (!plan) return;
    const ex = plan.exercises.find(e => e.id === id);
    if (!ex) return;
    
    editingExerciseId = id;
    
    // Fill basic info
    document.getElementById('exercise-name').value = ex.name;
    document.getElementById('sets-count').value = ex.sets.length;
    
    // Determine if sets are separate (different from each other)
    const isSeparate = ex.sets.some(s => s.reps !== ex.sets[0].reps || s.weight !== ex.sets[0].weight);
    document.getElementById('separate-sets').checked = isSeparate;
    
    // Generate inputs
    generateRepInputs();
    
    // Fill rep/weight inputs
    if (isSeparate) {
        ex.sets.forEach((set, index) => {
            const repInput = document.getElementById(`reps-set-${index + 1}`);
            const weightInput = document.getElementById(`weight-set-${index + 1}`);
            if (repInput) repInput.value = set.reps;
            if (weightInput) weightInput.value = set.weight;
        });
    } else {
        const repInput = document.getElementById('reps-set-global');
        const weightInput = document.getElementById('weight-set-global');
        if (repInput) repInput.value = ex.sets[0].reps;
        if (weightInput) weightInput.value = ex.sets[0].weight;
    }
    
    // Update button text
    const addBtn = document.getElementById('add-exercise-btn');
    addBtn.innerHTML = '<i class="fa-solid fa-check"></i> עדכן תרגיל';
    
    // Add cancel button if not already there
    if (!document.getElementById('cancel-edit-btn')) {
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.id = 'cancel-edit-btn';
        cancelBtn.className = 'btn';
        cancelBtn.style.marginTop = '10px';
        cancelBtn.style.background = 'rgba(255,255,255,0.1)';
        cancelBtn.innerHTML = 'ביטול עריכה';
        cancelBtn.onclick = cancelEdit;
        addBtn.parentNode.insertBefore(cancelBtn, addBtn.nextSibling);
    }
    
    // Scroll to top of form
    document.querySelector('.settings-card').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
    editingExerciseId = null;
    document.getElementById('exercise-name').value = '';
    document.getElementById('sets-count').value = '';
    document.getElementById('reps-inputs-container').innerHTML = '';
    document.getElementById('separate-sets').checked = false;
    
    const addBtn = document.getElementById('add-exercise-btn');
    addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> הוסף תרגיל לאימון';
    
    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) cancelBtn.remove();
}

// Remove Exercise from Plan
function removeExercise(id) {
    const plan = workoutPlans.find(p => p.id === selectedWorkoutId);
    if (!plan) return;
    plan.exercises = plan.exercises.filter(ex => ex.id !== id);
    renderCurrentPlan();
    renderWorkoutsList();
    saveAllPlans();
    
    if (plan.exercises.length === 0) {
        document.getElementById('save-plan-btn').disabled = true;
    }
}

// Render Current Plan in Setup Tab (Optimized with Fragment)
function renderCurrentPlan() {
    const list = elements.currentPlanList;
    const plan = workoutPlans.find(p => p.id === selectedWorkoutId);
    
    if (!plan || plan.exercises.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-info-circle"></i>
                <p>עדיין לא נוספו תרגילים לאימון זה.</p>
            </div>
        `;
        elements.savePlanBtn.disabled = true;
        return;
    }
    
    const fragment = document.createDocumentFragment();
    plan.exercises.forEach((ex, index) => {
        const item = document.createElement('div');
        item.className = 'exercise-item';
        item.draggable = true;
        item.dataset.index = index;
        item.dataset.id = ex.id;
        
        // Summary of sets and reps
        const summary = ex.sets.map(s => {
            const reps = typeof s === 'object' ? s.reps : s;
            const weight = typeof s === 'object' ? s.weight : 0;
            return `${reps}x${weight}ק"ג`;
        }).join(', ');
        
        item.innerHTML = `
            <div style="display: flex; align-items: center; flex: 1;">
                <div class="drag-handle" title="גרור לשינוי סדר">
                    <i class="fa-solid fa-grip-lines-vertical"></i>
                </div>
                <div class="exercise-info" style="flex: 1;">
                    <h3>${ex.name}</h3>
                    <p>${ex.sets.length} סטים: [${summary}]</p>
                </div>
            </div>
            <div class="item-actions">
                <button class="edit-btn" onclick="editExercise('${ex.id}')" title="ערוך תרגיל">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button class="remove-btn" onclick="removeExercise('${ex.id}')" title="הסר תרגיל">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;

        // Drag events
        // Drag events
        item.addEventListener('dragstart', function(e) {
            // Don't start drag if clicking on buttons or actions
            if (e.target.closest('button, .item-actions, input')) {
                e.preventDefault();
                return false;
            }
            handleDragStart.call(this, e);
        });
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('dragenter', handleDragEnter);
        item.addEventListener('dragleave', handleDragLeave);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);

        // Touch events for mobile
        item.addEventListener('touchstart', handleTouchStart, { passive: false });
        item.addEventListener('touchmove', handleTouchMove, { passive: false });
        item.addEventListener('touchend', handleTouchEnd);

        fragment.appendChild(item);
    });
    
    list.innerHTML = '';
    list.appendChild(fragment);
    elements.savePlanBtn.disabled = false;
}

// Save Plan - Now just confirms and moves to activity
function saveWorkoutPlan() {
    saveAllPlans();
    
    if (selectedWorkoutId) {
        customAlert('השינויים נשמרו בהצלחה!', () => {
            // Option to start this workout
            customConfirm('האם ברצונך להתחיל את האימון הזה עכשיו?', () => {
                startWorkout(selectedWorkoutId);
            });
        });
    }
}

// Load Plan from Local Storage and Firebase
async function loadPlanFromStorage() {
    // 1. Load from Local Storage (Immediate UI response)
    const savedPlans = localStorage.getItem('fitbud_plans');
    if (savedPlans) {
        workoutPlans = JSON.parse(savedPlans);
    }
    
    const savedActiveId = localStorage.getItem('fitbud_active_workout_id');
    if (savedActiveId) {
        activeWorkoutId = savedActiveId;
    }
    
    const savedState = localStorage.getItem('fitbud_activity_state');
    if (savedState) {
        activeWorkoutState = JSON.parse(savedState);
    }
    
    const savedRestTime = localStorage.getItem('fitbud_rest_time');
    if (savedRestTime) {
        restTime = parseInt(savedRestTime);
        const restInput = document.getElementById('global-rest-time');
        if (restInput) restInput.value = restTime;
    }

    renderWorkoutsList();
    renderCurrentPlan();
    renderActiveWorkout();

    // 2. Sync from Firebase (Real-time updates)
    try {
        const userRef = doc(db, "users", "default_user");
        
        // Use onSnapshot for real-time synchronization across devices
        onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                console.log("Data synced from Firebase");
                
                let needsReRender = false;

                // Sync plans
                if (data.workoutPlans) {
                    // Simple check to see if we should update local plans
                    // In a production app, we'd use timestamps or deeper comparison
                    if (JSON.stringify(workoutPlans) !== JSON.stringify(data.workoutPlans)) {
                        workoutPlans = data.workoutPlans;
                        localStorage.setItem('fitbud_plans', JSON.stringify(workoutPlans));
                        needsReRender = true;
                    }
                }
                
                // Sync rest time
                if (data.restTime && data.restTime !== restTime) {
                    restTime = data.restTime;
                    localStorage.setItem('fitbud_rest_time', restTime);
                    const restInput = document.getElementById('global-rest-time');
                    if (restInput) restInput.value = restTime;
                    needsReRender = true;
                }
                
                // Sync history
                if (data.history) {
                    const localHistory = localStorage.getItem('fitbud_history');
                    if (localHistory !== JSON.stringify(data.history)) {
                        localStorage.setItem('fitbud_history', JSON.stringify(data.history));
                        renderHistory();
                    }
                }
                
                if (needsReRender) {
                    renderWorkoutsList();
                    renderCurrentPlan();
                    renderActiveWorkout();
                }
            }
        }, (error) => {
            console.error("Real-time sync error:", error);
        });
    } catch (e) {
        console.error("Error setting up Firebase sync:", e);
    }
}

async function saveRestTime() {
    const restInput = document.getElementById('global-rest-time');
    if (restInput) {
        restTime = parseInt(restInput.value) || 60;
        localStorage.setItem('fitbud_rest_time', restTime);
        
        // Sync to Firebase
        try {
            const userRef = doc(db, "users", "default_user");
            await setDoc(userRef, { restTime: restTime }, { merge: true });
        } catch (e) {
            console.error("Error saving rest time to Firebase:", e);
        }
    }
}

// Render Active Workout in Activity Tab (Optimized with Fragment)
function renderActiveWorkout() {
    const container = elements.activeWorkoutContainer;
    const actionsDiv = elements.workoutActions;
    
    const activePlan = workoutPlans.find(p => p.id === activeWorkoutId);
    
    if (!activePlan || activePlan.exercises.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-dumbbell"></i>
                <p>אין אימון פעיל כרגע.</p>
                <p style="font-size: 14px;">בחר אימון מרשימת האימונים ולחץ על "התחל" כדי להתחיל.</p>
            </div>
        `;
        if (actionsDiv) actionsDiv.style.display = 'none';
        return;
    }
    
    if (actionsDiv) actionsDiv.style.display = 'block';
    
    const fragment = document.createDocumentFragment();
    
    activePlan.exercises.forEach(ex => {
        const card = document.createElement('div');
        card.className = 'workout-exercise-card';
        
        const header = document.createElement('div');
        header.className = 'workout-exercise-header';
        header.innerHTML = `<h3>${ex.name}</h3>`;
        
        const setsContainer = document.createElement('div');
        setsContainer.className = 'sets-container';
        
        ex.sets.forEach((setData, index) => {
            const circle = document.createElement('div');
            circle.className = 'set-circle';
            circle.style.flexDirection = 'column';
            circle.style.lineHeight = '1.2';
            
            const stateKey = `${ex.id}-${index}`;
            const isDone = activeWorkoutState.hasOwnProperty(stateKey);
            if (isDone) {
                circle.classList.add('done');
            }
            
            const originalReps = typeof setData === 'object' ? setData.reps : setData;
            const weight = typeof setData === 'object' ? setData.weight : 0;
            const currentReps = isDone ? activeWorkoutState[stateKey] : originalReps;
            
            circle.innerHTML = `
                <span style="font-size: 18px; font-weight: 700;">${currentReps}</span>
                <span style="font-size: 12px; opacity: 0.9;">${weight}ק"ג</span>
            `;
            circle.title = `סט ${index + 1}: ${currentReps} חזרות, ${weight} ק"ג`;
            
            circle.onclick = () => toggleSetComplete(ex.id, index, circle, originalReps);
            
            setsContainer.appendChild(circle);
        });
        
        card.appendChild(header);
        card.appendChild(setsContainer);
        fragment.appendChild(card);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
}

// Toggle Set Completion State
function toggleSetComplete(exerciseId, setIndex, element, originalReps) {
    const stateKey = `${exerciseId}-${setIndex}`;
    
    if (!activeWorkoutState.hasOwnProperty(stateKey)) {
        // First click: mark as done with original reps
        activeWorkoutState[stateKey] = originalReps;
        element.classList.add('done');
        
        // Start rest timer (user defined)
        startTimer(restTime);
    } else {
        // Subsequent clicks: decrement
        let currentReps = activeWorkoutState[stateKey];
        if (currentReps > 0) {
            activeWorkoutState[stateKey] = currentReps - 1;
        } else {
            // Already 0, reset to initial state
            delete activeWorkoutState[stateKey];
            element.classList.remove('done');
        }
    }
    
    // Update display inside circle
    const repsSpan = element.querySelector('span:first-child');
    const isDone = activeWorkoutState.hasOwnProperty(stateKey);
    const displayReps = isDone ? activeWorkoutState[stateKey] : originalReps;
    
    if (repsSpan) {
        repsSpan.innerText = displayReps;
    }
    
    // Update title
    const weightMatch = element.title.match(/,\s*(\d+(\.\d+)?)\s*ק"ג/);
    const weightStr = weightMatch ? weightMatch[1] : '0';
    element.title = `סט ${setIndex + 1}: ${displayReps} חזרות, ${weightStr} ק"ג`;
    
    // Save state
    localStorage.setItem('fitbud_activity_state', JSON.stringify(activeWorkoutState));
}

// Timer Logic
let timerInterval = null;
let timeLeft = 60;
let isTimerRunning = false;

function startTimer(seconds = 60) {
    clearInterval(timerInterval);
    timeLeft = seconds;
    isTimerRunning = true;
    
    // Show mini timer
    if (elements.miniTimer) elements.miniTimer.style.display = 'flex';
    
    updateTimerDisplay();
    updateTimerToggleIcon();
    
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            isTimerRunning = false;
            updateTimerToggleIcon();
            flashTimerDisplay();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    if (elements.miniTimerDisplay) elements.miniTimerDisplay.innerText = timeStr;
}

function updateTimerToggleIcon() {
    const toggleBtn = document.getElementById('mini-timer-toggle');
    if (toggleBtn) {
        toggleBtn.innerHTML = isTimerRunning ? 
            '<i class="fa-solid fa-pause"></i>' : 
            '<i class="fa-solid fa-play"></i>';
    }
}

function toggleTimer() {
    if (isTimerRunning) {
        clearInterval(timerInterval);
        isTimerRunning = false;
    } else {
        if (timeLeft <= 0) timeLeft = 60;
        isTimerRunning = true;
        
        timerInterval = setInterval(() => {
            timeLeft--;
            updateTimerDisplay();
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                isTimerRunning = false;
                updateTimerToggleIcon();
                flashTimerDisplay();
            }
        }, 1000);
    }
    updateTimerToggleIcon();
}

function adjustTimer(amount) {
    timeLeft += amount;
    if (timeLeft < 0) timeLeft = 0;
    updateTimerDisplay();
}

function closeTimer() {
    clearInterval(timerInterval);
    isTimerRunning = false;
    if (elements.miniTimer) elements.miniTimer.style.display = 'none';
}

function flashTimerDisplay() {
    const miniDisplay = document.getElementById('mini-timer-display');
    
    if (miniDisplay) miniDisplay.style.animation = 'pulse 0.5s infinite alternate';
    
    setTimeout(() => {
        if (miniDisplay) miniDisplay.style.animation = '';
    }, 5000);
}

async function finishWorkout() {
    const activePlan = workoutPlans.find(p => p.id === activeWorkoutId);
    if (!activePlan || activePlan.exercises.length === 0) return;
    
    // Calculate stats
    let totalSets = 0;
    let completedSets = 0;
    
    activePlan.exercises.forEach(ex => {
        totalSets += ex.sets.length;
        ex.sets.forEach((_, index) => {
            if (activeWorkoutState.hasOwnProperty(`${ex.id}-${index}`)) {
                completedSets++;
            }
        });
    });
    
    const historyEntry = {
        id: Date.now().toString(),
        date: new Date().toLocaleString('he-IL'),
        workoutName: activePlan.name,
        workout: JSON.parse(JSON.stringify(activePlan.exercises)),
        state: activeWorkoutState,
        stats: {
            totalSets,
            completedSets
        }
    };
    
    // Load existing history
    let history = [];
    const savedHistory = localStorage.getItem('fitbud_history');
    if (savedHistory) {
        history = JSON.parse(savedHistory);
    }
    
    // Add new entry to beginning
    history.unshift(historyEntry);
    
    // Save back to storage
    localStorage.setItem('fitbud_history', JSON.stringify(history));
    
    // Sync to Firebase
    syncHistoryToFirebase(history);
    
    // Clear active state
    activeWorkoutState = {};
    localStorage.removeItem('fitbud_activity_state');
    
    customAlert('האימון נשמר בהיסטוריה בהצלחה!', () => {
        switchTab('history');
    });
}

// Helper to sync history to Firebase
async function syncHistoryToFirebase(history) {
    try {
        const userRef = doc(db, "users", "default_user");
        await setDoc(userRef, { history: history }, { merge: true });
        console.log("History synced to Firebase");
    } catch (e) {
        console.error("Error syncing history to Firebase:", e);
    }
}

function renderHistory() {
    const list = elements.historyList;
    if (!list) return;
    
    let history = [];
    const savedHistory = localStorage.getItem('fitbud_history');
    if (savedHistory) {
        history = JSON.parse(savedHistory);
    }
    
    if (history.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-calendar-xmark"></i>
                <p>עדיין אין אימונים שמורים בהיסטוריה.</p>
            </div>
        `;
        return;
    }
    
    const fragment = document.createDocumentFragment();
    history.forEach(entry => {
        const card = document.createElement('div');
        card.className = 'glass-card history-item';
        card.style.marginBottom = '15px';
        card.style.padding = '20px';
        card.style.background = 'var(--glass-bg)';
        card.style.border = '1px solid var(--glass-border)';
        card.style.borderRadius = 'var(--radius-md)';
        
        let exercisesHtml = '';
        entry.workout.forEach(ex => {
            let doneCount = 0;
            ex.sets.forEach((_, idx) => {
                if (entry.state.hasOwnProperty(`${ex.id}-${idx}`)) doneCount++;
            });
            
            exercisesHtml += `
                <div style="margin-top: 10px; font-size: 15px; color: var(--text-secondary);">
                    <strong>${ex.name}</strong>: ${doneCount}/${ex.sets.length} סטים בוצעו
                </div>
            `;
        });
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 10px;">
                <div style="text-align: right;">
                    <div style="font-weight: 600; font-size: 16px; color: var(--accent-color); display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-calendar-day"></i> 
                        <span>${entry.date}</span>
                        <button class="edit-btn" onclick="editHistoryDate('${entry.id}')" style="font-size: 12px; opacity: 0.7; padding: 2px 5px;" title="ערוך תאריך">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    </div>
                    <div style="font-size: 14px; color: var(--text-primary); margin-top: 4px; font-weight: 600;">
                        ${entry.workoutName || 'אימון'}
                    </div>
                </div>
                <div style="font-weight: bold; color: var(--success-color);">
                    ${entry.stats.completedSets}/${entry.stats.totalSets} סטים סה"כ
                </div>
            </div>
            <div>${exercisesHtml}</div>
            <div style="display: flex; gap: 10px; margin-top: 15px;">
                <button class="btn btn-primary" onclick="loadWorkoutFromHistory('${entry.id}')" style="padding: 8px 15px; font-size: 14px; width: auto;">
                    <i class="fa-solid fa-rotate-left"></i> טען לאימון חדש
                </button>
                <button class="remove-btn" onclick="deleteHistoryItem('${entry.id}')" style="font-size: 14px; display: flex; align-items: center; gap: 5px;" title="מחק מההיסטוריה">
                    <i class="fa-solid fa-trash-can"></i> מחק
                </button>
            </div>
        `;
        fragment.appendChild(card);
    });
    
    list.innerHTML = '';
    list.appendChild(fragment);
}

function deleteHistoryItem(id) {
    customConfirm('האם אתה בטוח שברצונך למחוק אימון זה מההיסטוריה?', async () => {
        let history = [];
        const savedHistory = localStorage.getItem('fitbud_history');
        if (savedHistory) {
            history = JSON.parse(savedHistory);
        }
        
        history = history.filter(entry => entry.id !== id);
        localStorage.setItem('fitbud_history', JSON.stringify(history));
        renderHistory();

        // Sync to Firebase
        syncHistoryToFirebase(history);
    });
}

function editHistoryDate(id) {
    const savedHistory = localStorage.getItem('fitbud_history');
    if (!savedHistory) return;
    
    let history = JSON.parse(savedHistory);
    const entryIndex = history.findIndex(h => h.id === id);
    if (entryIndex === -1) return;
    
    const entry = history[entryIndex];
    
    let currentDateTime;
    try {
        // entry.date is usually "DD.MM.YYYY, HH:mm:ss"
        const parts = entry.date.split(/[\.,\s:]+/);
        if (parts.length >= 5) {
            const day = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const year = parseInt(parts[2]);
            const hour = parseInt(parts[3]);
            const minute = parseInt(parts[4]);
            currentDateTime = new Date(year, month, day, hour, minute);
        } else {
            currentDateTime = new Date(parseInt(entry.id));
        }
    } catch (e) {
        currentDateTime = new Date();
    }

    if (isNaN(currentDateTime.getTime())) currentDateTime = new Date();

    const year = currentDateTime.getFullYear();
    const month = String(currentDateTime.getMonth() + 1).padStart(2, '0');
    const day = String(currentDateTime.getDate()).padStart(2, '0');
    const hours = String(currentDateTime.getHours()).padStart(2, '0');
    const minutes = String(currentDateTime.getMinutes()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}T${hours}:${minutes}`;

    const modal = document.getElementById('custom-modal');
    const msgEl = document.getElementById('modal-message');
    const btnContainer = document.getElementById('modal-buttons');
    
    msgEl.innerHTML = `
        <div style="margin-bottom: 15px; font-weight: 600;">עריכת תאריך ושעה</div>
        <div style="margin-bottom: 10px; font-size: 14px; color: var(--text-secondary);">בחר את המועד החדש עבור האימון:</div>
        <input type="datetime-local" id="edit-date-input" value="${formattedDate}" style="margin-bottom: 10px; background: rgba(15,23,42,0.8); border: 1px solid var(--accent-color);">
    `;
    
    btnContainer.innerHTML = `
        <button class="modal-btn modal-btn-cancel" id="modal-cancel-btn">ביטול</button>
        <button class="modal-btn modal-btn-confirm" id="modal-save-date-btn">שמור שינויים</button>
    `;
    
    modal.style.display = 'flex';
    
    document.getElementById('modal-cancel-btn').onclick = () => {
        modal.style.display = 'none';
        renderHistory(); // Re-render to clear the injected HTML in modal-message next time
    };

    document.getElementById('modal-save-date-btn').onclick = async () => {
        const newDateVal = document.getElementById('edit-date-input').value;
        if (newDateVal) {
            const newDate = new Date(newDateVal);
            entry.date = newDate.toLocaleString('he-IL');
            
            // Optionally sort history by date string? 
            // Better to sort by actual date objects.
            // But let's keep it simple for now as it's already sorted by ID (creation time) usually.
            
            localStorage.setItem('fitbud_history', JSON.stringify(history));
            renderHistory();
            modal.style.display = 'none';
            
            // Sync to Firebase
            syncHistoryToFirebase(history);
        }
    };
}

function loadWorkoutFromHistory(historyId) {
    const savedHistory = localStorage.getItem('fitbud_history');
    if (!savedHistory) return;
    
    const history = JSON.parse(savedHistory);
    const entry = history.find(h => h.id === historyId);
    
    if (entry) {
        customConfirm('האם ברצונך ליצור אימון חדש המבוסס על אימון זה מההיסטוריה?', () => {
            const newId = Date.now().toString();
            const newPlan = {
                id: newId,
                name: `${entry.workoutName || 'אימון'} (מהיסטוריה)`,
                exercises: JSON.parse(JSON.stringify(entry.workout))
            };
            
            workoutPlans.push(newPlan);
            saveAllPlans();
            
            renderWorkoutsList();
            selectWorkout(newId);
            switchTab('setup');
            
            // Scroll to the plan summary
            setTimeout(() => {
                document.querySelector('.plan-summary').scrollIntoView({ behavior: 'smooth' });
            }, 100);
        });
    }
}

// Custom Modal Logic
function customAlert(message, callback) {
    const modal = document.getElementById('custom-modal');
    const msgEl = document.getElementById('modal-message');
    const btnContainer = document.getElementById('modal-buttons');
    
    if (!modal || !msgEl || !btnContainer) return;
    
    msgEl.innerText = message;
    btnContainer.innerHTML = `
        <button class="modal-btn modal-btn-confirm" id="modal-ok-btn">אישור</button>
    `;
    
    modal.style.display = 'flex';
    
    const okBtn = document.getElementById('modal-ok-btn');
    okBtn.onclick = () => {
        modal.style.display = 'none';
        if (callback) callback();
    };
}

function customConfirm(message, onConfirm, onCancel) {
    const modal = document.getElementById('custom-modal');
    const msgEl = document.getElementById('modal-message');
    const btnContainer = document.getElementById('modal-buttons');
    
    if (!modal || !msgEl || !btnContainer) return;
    
    msgEl.innerText = message;
    btnContainer.innerHTML = `
        <button class="modal-btn modal-btn-cancel" id="modal-cancel-btn">ביטול</button>
        <button class="modal-btn modal-btn-confirm" id="modal-confirm-btn">אישור</button>
    `;
    
    modal.style.display = 'flex';
    
    const confirmBtn = document.getElementById('modal-confirm-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    
    confirmBtn.onclick = () => {
        modal.style.display = 'none';
        if (onConfirm) onConfirm();
    };
    
    cancelBtn.onclick = () => {
        modal.style.display = 'none';
        if (onCancel) onCancel();
    };
}

// Drag and Drop Logic
let dragSourceEl = null;

function initDragAndDrop() {
    // Listeners are added dynamically in renderCurrentPlan
}

function handleDragStart(e) {
    this.classList.add('dragging');
    dragSourceEl = this;
    
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dataset.index);
    }
    
    // Add a slight delay to ensure the ghost image is created correctly
    setTimeout(() => {
        this.style.opacity = '0.4';
    }, 0);
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    if (e.preventDefault) e.preventDefault();
    this.classList.add('over');
    
    // Live reordering on desktop - more stable on dragenter
    const draggingItem = document.querySelector('.exercise-item.dragging');
    if (draggingItem && draggingItem !== this) {
        const list = elements.currentPlanList;
        const children = Array.from(list.children);
        const draggingIndex = children.indexOf(draggingItem);
        const targetIndex = children.indexOf(this);
        
        if (draggingIndex < targetIndex) {
            this.after(draggingItem);
        } else {
            this.before(draggingItem);
        }
    }
}

function handleDragLeave(e) {
    this.classList.remove('over');
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    if (e.preventDefault) e.preventDefault();

    finishReorder();
    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    this.style.opacity = '1';
    
    const items = document.querySelectorAll('.exercise-item');
    items.forEach(item => {
        item.classList.remove('over');
    });
}

// Touch Support for Mobile
let touchStartY = 0;
let touchCurrentY = 0;

function handleTouchStart(e) {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    
    // Check if it's actually the handle or a button inside the card
    if (e.target.closest('.item-actions')) return;

    dragSourceEl = this;
    
    // Delay adding dragging class slightly to avoid pointer-events: none 
    // interrupting the touch start sequence in some browsers
    setTimeout(() => {
        if (dragSourceEl) {
            dragSourceEl.classList.add('dragging');
            if (window.navigator.vibrate) window.navigator.vibrate(20);
        }
    }, 50);
    
    touchStartY = e.touches[0].clientY;
}

let autoScrollInterval = null;

function handleTouchMove(e) {
    if (!dragSourceEl) return;
    
    const touch = e.touches[0];
    touchCurrentY = touch.clientY;
    
    // Prevent scrolling while dragging
    e.preventDefault();
    
    // Auto-scroll logic
    const scrollThreshold = 100;
    const scrollSpeed = 15;
    if (touch.clientY < scrollThreshold) {
        if (!autoScrollInterval) {
            autoScrollInterval = setInterval(() => window.scrollBy(0, -scrollSpeed), 20);
        }
    } else if (touch.clientY > window.innerHeight - scrollThreshold) {
        if (!autoScrollInterval) {
            autoScrollInterval = setInterval(() => window.scrollBy(0, scrollSpeed), 20);
        }
    } else {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
    }
    
    // Temporarily disable pointer events on dragging item to see what's underneath
    const originalPointerEvents = dragSourceEl.style.pointerEvents;
    dragSourceEl.style.pointerEvents = 'none';
    
    // Find the element at the current touch position
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    
    // Restore pointer events
    dragSourceEl.style.pointerEvents = originalPointerEvents;
    
    if (!target) return;
    
    const item = target.closest('.exercise-item');
    if (item && item !== dragSourceEl) {
        const list = elements.currentPlanList;
        const children = Array.from(list.children);
        const draggingIndex = children.indexOf(dragSourceEl);
        const targetIndex = children.indexOf(item);
        
        if (draggingIndex < targetIndex) {
            item.after(dragSourceEl);
        } else {
            item.before(dragSourceEl);
        }
    }
}

function handleTouchEnd(e) {
    if (!dragSourceEl) return;
    
    clearInterval(autoScrollInterval);
    autoScrollInterval = null;
    
    dragSourceEl.classList.remove('dragging');
    finishReorder();
    dragSourceEl = null;
}

function finishReorder() {
    const list = elements.currentPlanList;
    const items = Array.from(list.querySelectorAll('.exercise-item'));
    
    const plan = workoutPlans.find(p => p.id === selectedWorkoutId);
    if (!plan || !plan.exercises) return;
    
    // Get new order based on current DOM state (using IDs for robustness)
    const newExercises = [];
    items.forEach(item => {
        const exerciseId = item.dataset.id;
        const exercise = plan.exercises.find(ex => ex.id === exerciseId);
        if (exercise) {
            newExercises.push(exercise);
        }
    });
    
    if (newExercises.length === plan.exercises.length) {
        plan.exercises = newExercises;
        saveAllPlans();
    }
    
    // Re-render to update data-index and ensure everything is in sync
    renderCurrentPlan();
}



// Expose functions to global window scope for HTML event handlers
window.switchTab = switchTab;
window.createNewWorkout = createNewWorkout;
window.updateWorkoutName = updateWorkoutName;
window.renameWorkout = renameWorkout;
window.deleteWorkoutPlan = deleteWorkoutPlan;
window.startWorkout = startWorkout;
window.generateRepInputs = generateRepInputs;
window.addExercise = addExercise;
window.editExercise = editExercise;
window.cancelEdit = cancelEdit;
window.removeExercise = removeExercise;
window.saveWorkoutPlan = saveWorkoutPlan;
window.saveRestTime = saveRestTime;
window.toggleSetComplete = toggleSetComplete;
window.toggleTimer = toggleTimer;
window.adjustTimer = adjustTimer;
window.closeTimer = closeTimer;
window.finishWorkout = finishWorkout;
window.loadWorkoutFromHistory = loadWorkoutFromHistory;
window.deleteHistoryItem = deleteHistoryItem;
window.editHistoryDate = editHistoryDate;
window.selectWorkout = selectWorkout;
