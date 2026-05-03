import { 
    auth, 
    db,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    GoogleAuthProvider, 
    signInWithRedirect, 
    getRedirectResult,
    signInWithPopup,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    arrayUnion,
    arrayRemove,
    onSnapshot,
    collection,
    addDoc,
    query,
    orderBy,
    getDocs,
    limit,
    where,
    deleteDoc
} from './firebase-config.js';

// State Management
let workoutPlans = [];
let selectedWorkoutId = null;
let activeWorkoutId = null; // The workout currently being performed
let activeWorkoutState = {}; // Tracks completed sets in activity tab
let restTime = 90;
let editingExerciseId = null; // Tracks which exercise is being edited
let currentUser = null;
let authMode = 'login'; // 'login' or 'signup'
let userUnsubscribe = null; // To clean up Firestore listeners


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

    if (installBtn) installBtn.style.display = 'inline-flex';

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
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            if (isIOS) {
                showIOSInstallGuide();
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

}

function showIOSInstallGuide() {
    const modal = document.getElementById('custom-modal');
    const msgEl = document.getElementById('modal-message');
    const btnContainer = document.getElementById('modal-buttons');
    
    if (!modal || !msgEl || !btnContainer) return;
    
    msgEl.innerHTML = `
        <div class="ios-install-guide">
            <div class="guide-header">
                <i class="fa-solid fa-mobile-screen-button"></i>
                <h3>התקנה באייפון</h3>
            </div>
            <p>הוסיפו את <strong>שותף</strong> למסך הבית לגישה מהירה:</p>
            <div class="guide-steps">
                <div class="step">
                    <span class="step-num">1</span>
                    <p>לחצו על כפתור ה<strong>שיתוף</strong> <i class="fa-solid fa-arrow-up-from-bracket" style="color: #38bdf8;"></i></p>
                </div>
                <div class="step">
                    <span class="step-num">2</span>
                    <p>בחרו ב-<strong>"הוסף למסך הבית"</strong> <i class="fa-solid fa-square-plus"></i></p>
                </div>
            </div>
        </div>
    `;
    
    btnContainer.innerHTML = `
        <button class="modal-btn modal-btn-confirm" id="modal-close-guide" style="width: 100%;">הבנתי, תודה</button>
    `;
    
    modal.style.display = 'flex';
    
    document.getElementById('modal-close-guide').onclick = () => {
        modal.style.display = 'none';
        msgEl.innerHTML = '';
    };
}

function hideInstallPromotion() {
    const installBtn = document.getElementById('install-btn');
    if (installBtn) installBtn.style.display = 'none';
}

// Fallback for iOS
function checkIOSInstallation(forceShowAlert = false) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    
    if (isIOS && !isStandalone) {
        if (forceShowAlert) {
            showIOSInstallGuide();
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
    durationDisplay: null
};

let timerInterval = null;
let workoutDurationInterval = null;
let timerTargetTimestamp = null; // Task 3: Reliable Timer target
let timeLeft = 90;
let isTimerRunning = false;

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
    elements.durationBar = document.getElementById('workout-duration-bar');
    elements.durationDisplay = document.getElementById('workout-duration-display');

    // Auth Event Listeners
    const authToggleText = document.getElementById('auth-toggle-text');
    if (authToggleText) {
        authToggleText.onclick = toggleAuthMode;
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = handleLogout;
    }

    const googleBtn = document.getElementById('google-login-btn');
    if (googleBtn) {
        googleBtn.onclick = handleGoogleLogin;
    }

    // Monitor Auth State
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            document.getElementById('auth-tab').classList.remove('active');
            document.getElementById('setup-tab').classList.add('active');
            document.getElementById('logout-btn').style.display = 'inline-flex';
            
            // Sync UI state
            switchTab('setup');
            
            // Load user data from Firebase
            loadPlanFromStorage(user.uid);
        } else {
            if (userUnsubscribe) {
                userUnsubscribe();
                userUnsubscribe = null;
            }
            currentUser = null;
            document.getElementById('auth-tab').classList.add('active');
            document.getElementById('setup-tab').classList.remove('active');
            document.getElementById('activity-tab').classList.remove('active');
            document.getElementById('history-tab').classList.remove('active');
            document.getElementById('logout-btn').style.display = 'none';
            
            // Clear local data
            workoutPlans = [];
            renderWorkoutsList();
        }
    });

    // Initial check for installation status
    showInstallPromotion();

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.error('Service Worker registration failed', err));
    }

    // Handle Google Redirect Result
    getRedirectResult(auth).catch((error) => {
        console.error("Google Redirect error:", error);
        if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
            customAlert('אירעה שגיאה בתהליך ההתחברות עם Google.');
        }
    });
});

// Auth Functions
function toggleAuthMode() {
    const title = document.getElementById('auth-title');
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleText = document.getElementById('auth-toggle-text');
    
    if (authMode === 'login') {
        authMode = 'signup';
        title.innerHTML = '<i class="fa-solid fa-user-plus"></i> הרשמה';
        submitBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> הרשם';
        toggleText.innerHTML = 'כבר יש לך חשבון? <span style="color: var(--accent-color); font-weight: 600;">התחבר כאן</span>';
    } else {
        authMode = 'login';
        title.innerHTML = '<i class="fa-solid fa-user-lock"></i> התחברות';
        submitBtn.innerHTML = '<i class="fa-solid fa-sign-in-alt"></i> התחבר';
        toggleText.innerHTML = 'אין לך חשבון? <span style="color: var(--accent-color); font-weight: 600;">הרשם עכשיו</span>';
    }
}

async function handleAuth() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const submitBtn = document.getElementById('auth-submit-btn');
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> מעבד...';
    
    try {
        if (authMode === 'login') {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            await createUserWithEmailAndPassword(auth, email, password);
        }
    } catch (error) {
        console.error("Auth error:", error);
        let message = 'אירעה שגיאה בתהליך האימות.';
        if (error.code === 'auth/wrong-password') message = 'סיסמה שגויה.';
        if (error.code === 'auth/user-not-found') message = 'משתמש לא נמצא.';
        if (error.code === 'auth/email-already-in-use') message = 'כתובת האימייל כבר בשימוש.';
        if (error.code === 'auth/weak-password') message = 'הסיסמה חלשה מדי (לפחות 6 תווים).';
        if (error.code === 'auth/invalid-email') message = 'כתובת אימייל לא תקינה.';
        customAlert(message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = authMode === 'login' ? 
            '<i class="fa-solid fa-sign-in-alt"></i> התחבר' : 
            '<i class="fa-solid fa-user-plus"></i> הרשם';
    }
}

async function handleGoogleLogin() {
    const btn = document.getElementById('google-login-btn');
    const originalContent = btn ? btn.innerHTML : '';
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> מעבד...';
    }
    
    try {
        const provider = new GoogleAuthProvider();
        // Force the provider to use the popup resolver
        provider.setCustomParameters({
            prompt: 'select_account'
        });
        
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Google Auth error:", error);
        
        // Fallback to redirect only if popup is explicitly blocked
        if (error.code === 'auth/popup-blocked') {
            try {
                await signInWithRedirect(auth, provider);
            } catch (redirError) {
                console.error("Redirect error:", redirError);
                customAlert('הדפדפן חסם את חלון ההתחברות. נסה לאפשר חלונות קופצים בהגדרות הדפדפן או להשתמש בדפדפן אחר.');
            }
        } else if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
            customAlert('אירעה שגיאה בהתחברות עם Google: ' + (error.message || 'שגיאה לא ידועה'));
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}

async function handleLogout() {
    customConfirm('האם אתה בטוח שברצונך להתנתק?', async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout error:", error);
        }
    });
}

// Expose functions to window for HTML event handlers
window.handleAuth = handleAuth;
window.handleGoogleLogin = handleGoogleLogin;
window.toggleAuthMode = toggleAuthMode;
window.switchTab = switchTab;
window.saveRestTime = saveRestTime;
window.createNewWorkout = createNewWorkout;
window.updateWorkoutName = updateWorkoutName;
window.addExercise = addExercise;
window.saveWorkoutPlan = saveWorkoutPlan;
window.toggleTimer = toggleTimer;
window.adjustTimer = adjustTimer;
window.closeTimer = closeTimer;
window.finishWorkout = finishWorkout;
window.stopWorkout = stopWorkout;

async function loadUserData() {
    if (!currentUser) return;
    
    try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const data = userSnap.data();
            if (data.workoutPlans) {
                workoutPlans = data.workoutPlans;
                renderWorkoutsList();
                renderCurrentPlan();
            }
            if (data.restTime) {
                restTime = data.restTime;
                document.getElementById('global-rest-time').value = restTime;
            }
        }
    } catch (error) {
        console.error("Error loading user data:", error);
    }
}

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

function isPerfectWorkout(historyEntry) {
    if (!historyEntry || !historyEntry.workout || !historyEntry.state) return false;
    
    for (const ex of historyEntry.workout) {
        for (let i = 0; i < ex.sets.length; i++) {
            const stateKey = `${ex.id}-${i}`;
            const repsPerformed = historyEntry.state[stateKey];
            
            // Handle both object and simple number formats for older data
            const setData = ex.sets[i];
            const repsRequired = typeof setData === 'object' ? setData.reps : setData;
            
            if (repsPerformed === undefined || repsPerformed < repsRequired) {
                return false;
            }
        }
    }
    return true;
}

function showWeightIncreaseModal(plan, callback) {
    const modal = document.getElementById('custom-modal');
    const msgEl = document.getElementById('modal-message');
    const btnContainer = document.getElementById('modal-buttons');
    
    if (!modal || !msgEl || !btnContainer) {
        callback();
        return;
    }

    let exercisesHtml = '';
    plan.exercises.forEach((ex, idx) => {
        // Get current weight from first set as preview
        const currentWeight = ex.sets && ex.sets[0] ? (ex.sets[0].weight || 0) : 0;
        
        exercisesHtml += `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="text-align: right; flex: 1;">
                    <div style="font-weight: 700; font-size: 15px; color: white;">${ex.name}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">משקל נוכחי: ${currentWeight} ק"ג</div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-right: 10px;">
                    <span style="font-size: 16px; color: var(--success-color); font-weight: bold;">+</span>
                    <input type="number" class="exercise-increase-input" data-index="${idx}" value="2.5" step="0.5" min="0" 
                        style="width: 70px; text-align: center; font-size: 18px; font-weight: 700; border: 2px solid var(--accent-color); border-radius: 8px; background: rgba(15,23,42,0.9); color: white; padding: 5px;">
                    <span style="font-size: 12px; font-weight: 600;">ק"ג</span>
                </div>
            </div>
        `;
    });

    msgEl.innerHTML = `
        <div style="text-align: center; direction: rtl;">
            <i class="fa-solid fa-trophy" style="font-size: 36px; color: #fbbf24; margin-bottom: 15px; filter: drop-shadow(0 0 10px rgba(251, 191, 36, 0.4));"></i>
            <h3 style="margin-bottom: 8px; font-size: 20px; color: white;">אימון קודם מושלם!</h3>
            <p style="margin-bottom: 20px; font-size: 15px; color: var(--text-secondary);">בכמה תרצה להעלות משקל לכל תרגיל?</p>
            <div style="max-height: 50vh; overflow-y: auto; padding: 5px; margin-bottom: 10px;" class="custom-scrollbar">
                ${exercisesHtml}
            </div>
        </div>
    `;
    
    btnContainer.innerHTML = `
        <button class="modal-btn modal-btn-cancel" id="modal-skip-btn" style="flex: 1;">ללא שינוי</button>
        <button class="modal-btn modal-btn-confirm" id="modal-increase-btn" style="flex: 1.5;">עדכן משקלים והתחל</button>
    `;
    
    modal.style.display = 'flex';
    
    document.getElementById('modal-skip-btn').onclick = () => {
        modal.style.display = 'none';
        callback();
    };
    
    document.getElementById('modal-increase-btn').onclick = () => {
        const inputs = document.querySelectorAll('.exercise-increase-input');
        let anyChange = false;
        
        inputs.forEach(input => {
            const idx = parseInt(input.dataset.index);
            const increase = parseFloat(input.value) || 0;
            if (increase > 0) {
                anyChange = true;
                plan.exercises[idx].sets.forEach(set => {
                    set.weight = (parseFloat(set.weight) || 0) + increase;
                });
            }
        });

        if (anyChange) {
            saveAllPlans();
            renderWorkoutsList();
            renderCurrentPlan();
        }
        
        modal.style.display = 'none';
        callback();
    };
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

async function performStartWorkout(id) {
    const plan = workoutPlans.find(p => p.id === id);
    if (!plan) return;

    // Check history for progressive overload - Task 1: Fetch from Firestore
    if (currentUser) {
        try {
            const historyRef = collection(db, "users", currentUser.uid, "history");
            const q = query(historyRef, orderBy("timestamp", "desc"), limit(10));
            const querySnapshot = await getDocs(q);
            
            let lastSession = null;
            querySnapshot.forEach(doc => {
                const data = doc.data();
                if (!lastSession && (data.planId === id || data.workoutName === plan.name)) {
                    lastSession = data;
                }
            });
            
            if (lastSession && isPerfectWorkout(lastSession)) {
                showWeightIncreaseModal(plan, () => {
                    startActiveWorkout(id);
                });
                return;
            }
        } catch (e) {
            console.error("Error checking history for progressive overload:", e);
        }
    }

    startActiveWorkout(id);
}

function startActiveWorkout(id) {
    activeWorkoutId = id;
    activeWorkoutState = {
        startTime: Date.now()
    };
    localStorage.setItem('fitbud_active_workout_id', activeWorkoutId);
    localStorage.setItem('fitbud_activity_state', JSON.stringify(activeWorkoutState));
    
    startWorkoutDurationTimer();
    renderActiveWorkout();
    switchTab('activity');
    
    // Scroll to top of activity
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startWorkoutDurationTimer() {
    if (workoutDurationInterval) clearInterval(workoutDurationInterval);
    
    if (elements.durationBar) elements.durationBar.style.display = 'flex';
    
    updateWorkoutDurationDisplay();
    
    workoutDurationInterval = setInterval(() => {
        updateWorkoutDurationDisplay();
    }, 1000);
}

function updateWorkoutDurationDisplay() {
    if (!activeWorkoutState || !activeWorkoutState.startTime || !elements.durationDisplay) return;
    
    const diff = Date.now() - activeWorkoutState.startTime;
    elements.durationDisplay.innerText = formatDuration(diff);
}

function formatDuration(ms) {
    if (!ms || ms < 0) return "00:00:00";
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

async function saveAllPlans() {
    // Task 2: Firebase Persistence handles the "offline" state
    try {
        if (!currentUser) return;
        const userRef = doc(db, "users", currentUser.uid);
        await setDoc(userRef, { 
            workoutPlans: workoutPlans,
            restTime: restTime
        }, { merge: true });
        console.log("Plans synced to Firebase");
    } catch (e) {
        console.error("Error syncing plans to Firebase:", e);
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
        item.addEventListener('touchcancel', handleTouchEnd);

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

// Load Plan from Firebase - Task 2: Relying on Firebase Persistence
async function loadPlanFromStorage(uid) {
    // Keep localStorage ONLY for ephemeral active-workout state as per Task 2
    const savedActiveId = localStorage.getItem('fitbud_active_workout_id');
    if (savedActiveId) {
        activeWorkoutId = savedActiveId;
    }
    
    const savedState = localStorage.getItem('fitbud_activity_state');
    if (savedState) {
        activeWorkoutState = JSON.parse(savedState);
    }

    if (activeWorkoutId && activeWorkoutState.startTime) {
        renderActiveWorkout();
        startWorkoutDurationTimer();
    }

    // Task 2: Firebase Persistence handles the "offline" state for plans and history
    if (!uid) return;
    try {
        const userRef = doc(db, "users", uid);
        
        // Cleanup existing listener if any
        if (userUnsubscribe) userUnsubscribe();
        
        // Use onSnapshot for real-time synchronization across devices
        userUnsubscribe = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                console.log("Data synced from Firebase");
                
                let needsReRender = false;

                // Sync plans
                if (data.workoutPlans) {
                    if (JSON.stringify(workoutPlans) !== JSON.stringify(data.workoutPlans)) {
                        workoutPlans = data.workoutPlans;
                        needsReRender = true;
                    }
                }
                
                // Sync rest time
                if (data.restTime && data.restTime !== restTime) {
                    restTime = data.restTime;
                    const restInput = document.getElementById('global-rest-time');
                    if (restInput) restInput.value = restTime;
                    needsReRender = true;
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
        restTime = parseInt(restInput.value) || 90;
        localStorage.setItem('fitbud_rest_time', restTime);
        
        // Sync to Firebase
        try {
            if (!currentUser) return;
            const userRef = doc(db, "users", currentUser.uid);
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
        if (elements.durationBar) elements.durationBar.style.display = 'none';
        if (workoutDurationInterval) {
            clearInterval(workoutDurationInterval);
            workoutDurationInterval = null;
        }
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
    
    if (elements.durationBar) elements.durationBar.style.display = 'flex';
    if (activeWorkoutState.startTime && !workoutDurationInterval) {
        startWorkoutDurationTimer();
    }
    if (actionsDiv) actionsDiv.style.display = 'flex';
    
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

// Timer Logic - Task 3: Mobile-Reliable Timers
function startTimer(seconds = 90) {
    clearInterval(timerInterval);
    timeLeft = seconds;
    timerTargetTimestamp = Date.now() + (seconds * 1000);
    isTimerRunning = true;
    
    // Show mini timer
    if (elements.miniTimer) elements.miniTimer.style.display = 'flex';
    
    updateTimerDisplay();
    updateTimerToggleIcon();
    
    // Task 3: Use setInterval ONLY to update UI based on target timestamp
    timerInterval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((timerTargetTimestamp - Date.now()) / 1000));
        timeLeft = remaining;
        updateTimerDisplay();
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            isTimerRunning = false;
            updateTimerToggleIcon();
            flashTimerDisplay();
        }
    }, 200); // More frequent updates for smoother UI
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
        // Task 3: Save remaining time if paused
        timeLeft = Math.max(0, Math.ceil((timerTargetTimestamp - Date.now()) / 1000));
    } else {
        if (timeLeft <= 0) timeLeft = restTime || 90;
        isTimerRunning = true;
        timerTargetTimestamp = Date.now() + (timeLeft * 1000);
        
        timerInterval = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((timerTargetTimestamp - Date.now()) / 1000));
            timeLeft = remaining;
            updateTimerDisplay();
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                isTimerRunning = false;
                updateTimerToggleIcon();
                flashTimerDisplay();
            }
        }, 200);
    }
    updateTimerToggleIcon();
}

function adjustTimer(amount) {
    timeLeft += amount;
    if (timeLeft < 0) timeLeft = 0;
    
    // Task 3: Update target timestamp if running
    if (isTimerRunning) {
        timerTargetTimestamp = Date.now() + (timeLeft * 1000);
    }
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
    
    const durationMs = activeWorkoutState.startTime ? (Date.now() - activeWorkoutState.startTime) : 0;
    
    const historyEntry = {
        planId: activeWorkoutId,
        timestamp: Date.now(), // Task 1: Added for better sorting in subcollections
        date: new Date().toLocaleString('he-IL'),
        workoutName: activePlan.name,
        workout: JSON.parse(JSON.stringify(activePlan.exercises)),
        state: activeWorkoutState,
        duration: formatDuration(durationMs),
        stats: {
            totalSets,
            completedSets
        }
    };
    
    // Task 1: Save as separate document in subcollection
    saveHistoryEntryToFirebase(historyEntry);
    
    // Clear active state
    activeWorkoutState = {};
    activeWorkoutId = null;
    if (workoutDurationInterval) {
        clearInterval(workoutDurationInterval);
        workoutDurationInterval = null;
    }
    if (elements.durationBar) elements.durationBar.style.display = 'none';
    
    localStorage.removeItem('fitbud_activity_state');
    localStorage.removeItem('fitbud_active_workout_id');
    
    customAlert('האימון נשמר בהיסטוריה בהצלחה!', () => {
        switchTab('history');
    });
}

function stopWorkout() {
    customConfirm('האם אתה בטוח שברצונך לעצור את האימון? ההתקדמות הנוכחית לא תישמר.', () => {
        activeWorkoutId = null;
        activeWorkoutState = {};
        if (workoutDurationInterval) {
            clearInterval(workoutDurationInterval);
            workoutDurationInterval = null;
        }
        if (elements.durationBar) elements.durationBar.style.display = 'none';
        
        localStorage.removeItem('fitbud_active_workout_id');
        localStorage.removeItem('fitbud_activity_state');
        if (typeof closeTimer === 'function') closeTimer();
        switchTab('setup');
    });
}

// Task 1: Save history entry to subcollection
async function saveHistoryEntryToFirebase(entry) {
    try {
        if (!currentUser) return;
        const historyRef = collection(db, "users", currentUser.uid, "history");
        await addDoc(historyRef, entry);
        console.log("Workout entry saved to Firestore subcollection");
    } catch (e) {
        console.error("Error saving history entry:", e);
    }
}

// Task 1: Fetch and render history from Firestore subcollection
async function renderHistory() {
    const list = elements.historyList;
    if (!list) return;
    
    if (!currentUser) {
        list.innerHTML = '<p style="text-align:center; padding:20px;">התחבר כדי לצפות בהיסטוריה.</p>';
        return;
    }

    list.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
            <i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 10px;"></i>
            <p>טוען היסטוריה...</p>
        </div>
    `;
    
    try {
        const historyRef = collection(db, "users", currentUser.uid, "history");
        const q = query(historyRef, orderBy("timestamp", "desc"), limit(50));
        const querySnapshot = await getDocs(q);
        
        const history = [];
        querySnapshot.forEach((doc) => {
            history.push({ id: doc.id, ...doc.data() });
        });
        
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
                const performedSets = [];
                ex.sets.forEach((setData, idx) => {
                    const stateKey = `${ex.id}-${idx}`;
                    if (entry.state && entry.state.hasOwnProperty(stateKey)) {
                        const reps = entry.state[stateKey];
                        const weight = typeof setData === 'object' ? setData.weight : 0;
                        performedSets.push({ reps, weight });
                    }
                });
                
                let setsSummary = '';
                if (performedSets.length > 0) {
                    const first = performedSets[0];
                    const allSame = performedSets.every(s => s.reps === first.reps && s.weight === first.weight);
                    
                    if (allSame && performedSets.length > 1) {
                        setsSummary = `${performedSets.length} × ${first.reps} [${first.weight}ק"ג]`;
                    } else {
                        setsSummary = performedSets.map(s => `${s.reps}×${s.weight}`).join(', ') + ' ק"ג';
                    }
                } else {
                    setsSummary = 'לא בוצע';
                }
                
                exercisesHtml += `
                    <div style="margin-top: 10px; font-size: 14px; color: var(--text-secondary); border-right: 2px solid var(--accent-color); padding-right: 10px; margin-bottom: 5px;">
                        <div style="color: var(--text-primary); font-weight: 600;">${ex.name}</div>
                        <div style="font-size: 13px;">${performedSets.length}/${ex.sets.length} סטים | ${setsSummary}</div>
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
                    <div style="font-weight: bold; color: var(--success-color); text-align: left;">
                        <div>${entry.stats.completedSets}/${entry.stats.totalSets} סטים</div>
                        <div style="font-size: 13px; color: var(--accent-color); margin-top: 4px; display: flex; align-items: center; gap: 5px; justify-content: flex-end;">
                            <i class="fa-solid fa-stopwatch" style="font-size: 12px;"></i>
                            <span>${entry.duration || '--:--'}</span>
                        </div>
                    </div>
                </div>
                <div>${exercisesHtml}</div>
                <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 15px;">
                    <button class="btn btn-primary" onclick="editHistoryPerformance('${entry.id}')" style="padding: 8px 12px; font-size: 13px; width: auto; flex: 1; min-width: 140px; background: rgba(255,255,255,0.1); border: 1px solid var(--glass-border);">
                        <i class="fa-solid fa-pen-to-square"></i> ערוך ביצוע
                    </button>
                    <button class="remove-btn" onclick="deleteHistoryItem('${entry.id}')" style="font-size: 13px; display: flex; align-items: center; gap: 5px; padding: 8px;" title="מחק מההיסטוריה">
                        <i class="fa-solid fa-trash-can"></i> מחק
                    </button>
                </div>
            `;
            fragment.appendChild(card);
        });
        
        list.innerHTML = '';
        list.appendChild(fragment);
    } catch (e) {
        console.error("Error loading history:", e);
        list.innerHTML = '<p style="text-align:center; padding:20px; color:var(--error-color);">שגיאה בטעינת ההיסטוריה.</p>';
    }
}

function deleteHistoryItem(id) {
    customConfirm('האם אתה בטוח שברצונך למחוק אימון זה מההיסטוריה?', async () => {
        try {
            if (!currentUser) return;
            const entryRef = doc(db, "users", currentUser.uid, "history", id);
            await deleteDoc(entryRef);
            renderHistory();
        } catch (e) {
            console.error("Error deleting history item:", e);
            customAlert("אירעה שגיאה במחיקת האימון.");
        }
    });
}

async function editHistoryDate(id) {
    if (!currentUser) return;
    
    try {
        const entryRef = doc(db, "users", currentUser.uid, "history", id);
        const docSnap = await getDoc(entryRef);
        
        if (!docSnap.exists()) return;
        const entry = docSnap.data();
    
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
        <div style="margin-bottom: 20px; font-weight: 700; font-size: 20px; color: var(--accent-color);">עריכת תאריך ושעה</div>
        <div style="margin-bottom: 15px; font-size: 15px; color: var(--text-secondary);">בחר את המועד החדש עבור האימון:</div>
        <input type="datetime-local" id="edit-date-input" class="modal-datetime-input" value="${formattedDate}">
    `;
    
    btnContainer.innerHTML = `
        <button class="modal-btn modal-btn-cancel" id="modal-cancel-btn">
            <i class="fa-solid fa-xmark" style="margin-left: 8px;"></i> ביטול
        </button>
        <button class="modal-btn modal-btn-confirm" id="modal-save-date-btn">
            <i class="fa-solid fa-floppy-disk" style="margin-left: 8px;"></i> שמור שינויים
        </button>
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
            
            // Task 1: Update in Firestore subcollection
            try {
                await updateDoc(entryRef, { date: entry.date });
                renderHistory();
                modal.style.display = 'none';
            } catch (e) {
                console.error("Error updating history date:", e);
                customAlert("אירעה שגיאה בעדכון התאריך.");
            }
        }
    };
} catch (e) {
    console.error("Error loading history entry for edit:", e);
}
}

async function editHistoryPerformance(id) {
    if (!currentUser) return;
    
    try {
        const entryRef = doc(db, "users", currentUser.uid, "history", id);
        const docSnap = await getDoc(entryRef);
        
        if (!docSnap.exists()) return;
        const entry = docSnap.data();

    const modal = document.getElementById('custom-modal');
    const msgEl = document.getElementById('modal-message');
    const btnContainer = document.getElementById('modal-buttons');
    
    msgEl.style.textAlign = 'right';
    msgEl.innerHTML = `
        <div style="margin-bottom: 20px; font-weight: 700; font-size: 20px; color: var(--accent-color); border-bottom: 1px solid var(--glass-border); padding-bottom: 10px;">עריכת ביצועי אימון</div>
        <div id="history-edit-container" style="max-height: 60vh; overflow-y: auto; padding: 0 5px; margin-bottom: 10px;">
            ${entry.workout.map((ex, exIdx) => `
                <div style="margin-bottom: 15px; background: rgba(255,255,255,0.03); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--glass-border);">
                    <div style="font-weight: 600; margin-bottom: 10px; color: var(--text-primary); font-size: 15px;">${ex.name}</div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${ex.sets.map((setData, setIdx) => {
                            const stateKey = `${ex.id}-${setIdx}`;
                            const reps = entry.state[stateKey] || 0;
                            const weight = (typeof setData === 'object') ? setData.weight : 0;
                            return `
                                <div style="display: flex; align-items: center; gap: 8px; font-size: 13px;">
                                    <span style="min-width: 40px; color: var(--text-secondary);">סט ${setIdx + 1}:</span>
                                    <div style="display: flex; gap: 6px; flex: 1;">
                                        <div style="flex: 1; display: flex; align-items: center; gap: 4px; background: rgba(15,23,42,0.4); padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                                            <input type="number" class="edit-history-reps" data-ex="${exIdx}" data-set="${setIdx}" value="${reps}" style="width: 40px; background: transparent; border: none; color: var(--text-primary); text-align: center; font-weight: 700; padding: 0;">
                                            <span style="opacity: 0.7; font-size: 11px;">חז'</span>
                                        </div>
                                        <div style="flex: 1; display: flex; align-items: center; gap: 4px; background: rgba(15,23,42,0.4); padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                                            <input type="number" class="edit-history-weight" data-ex="${exIdx}" data-set="${setIdx}" value="${weight}" step="0.5" style="width: 45px; background: transparent; border: none; color: var(--accent-color); text-align: center; font-weight: 700; padding: 0;">
                                            <span style="opacity: 0.7; font-size: 11px;">ק"ג</span>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    btnContainer.innerHTML = `
        <button class="modal-btn modal-btn-cancel" id="modal-cancel-edit-btn">
            <i class="fa-solid fa-xmark" style="margin-left: 8px;"></i> ביטול
        </button>
        <button class="modal-btn modal-btn-confirm" id="modal-save-performance-btn">
            <i class="fa-solid fa-floppy-disk" style="margin-left: 8px;"></i> שמור
        </button>
    `;
    
    modal.style.display = 'flex';
    
    document.getElementById('modal-cancel-edit-btn').onclick = () => {
        modal.style.display = 'none';
        renderHistory();
    };

    document.getElementById('modal-save-performance-btn').onclick = async () => {
        const repInputs = document.querySelectorAll('.edit-history-reps');
        const weightInputs = document.querySelectorAll('.edit-history-weight');
        
        let completedSets = 0;
        
        repInputs.forEach(input => {
            const exIdx = parseInt(input.dataset.ex);
            const setIdx = parseInt(input.dataset.set);
            const reps = parseInt(input.value) || 0;
            const ex = entry.workout[exIdx];
            const stateKey = `${ex.id}-${setIdx}`;
            
            if (reps > 0) {
                entry.state[stateKey] = reps;
                completedSets++;
            } else {
                delete entry.state[stateKey];
            }
        });

        weightInputs.forEach(input => {
            const exIdx = parseInt(input.dataset.ex);
            const setIdx = parseInt(input.dataset.set);
            const weight = parseFloat(input.value) || 0;
            const ex = entry.workout[exIdx];
            
            if (typeof ex.sets[setIdx] === 'object') {
                ex.sets[setIdx].weight = weight;
            } else {
                ex.sets[setIdx] = { reps: ex.sets[setIdx], weight: weight };
            }
        });
        
        entry.stats.completedSets = completedSets;
        
        renderHistory();
        // Task 1: Update in Firestore subcollection
        try {
            await updateDoc(entryRef, {
                workout: entry.workout,
                state: entry.state,
                stats: {
                    totalSets: entry.stats.totalSets,
                    completedSets: completedSets
                }
            });
            renderHistory();
            modal.style.display = 'none';
        } catch (e) {
            console.error("Error updating history performance:", e);
            customAlert("אירעה שגיאה בעדכון הביצועים.");
        }
    };
} catch (e) {
    console.error("Error loading history entry for edit:", e);
}
}

async function loadWorkoutFromHistory(historyId) {
    if (!currentUser) return;
    
    try {
        const entryRef = doc(db, "users", currentUser.uid, "history", historyId);
        const docSnap = await getDoc(entryRef);
        
        if (!docSnap.exists()) return;
        const entry = docSnap.data();
        
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
                const summary = document.querySelector('.plan-summary');
                if (summary) summary.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        });
    } catch (e) {
        console.error("Error loading workout from history:", e);
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
        <button class="modal-btn modal-btn-confirm" id="modal-ok-btn">
            <i class="fa-solid fa-check" style="margin-left: 8px;"></i> אישור
        </button>
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
        <button class="modal-btn modal-btn-cancel" id="modal-cancel-btn">
            <i class="fa-solid fa-xmark" style="margin-left: 8px;"></i> ביטול
        </button>
        <button class="modal-btn modal-btn-confirm" id="modal-confirm-btn">
            <i class="fa-solid fa-check" style="margin-left: 8px;"></i> אישור
        </button>
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
let dragStarted = false;
let dragTimer = null;

function handleTouchStart(e) {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    
    // Check if it's actually the handle or a button inside the card
    if (e.target.closest('.item-actions')) return;

    dragSourceEl = this;
    touchStartY = e.touches[0].clientY;
    dragStarted = false;
    
    // Set a small timer to distinguish between a tap/scroll and a drag
    // On iPhone, this is crucial to allow natural scrolling if the user moves quickly
    dragTimer = setTimeout(() => {
        if (dragSourceEl) {
            dragStarted = true;
            dragSourceEl.classList.add('dragging');
            if (window.navigator.vibrate) window.navigator.vibrate(20);
        }
    }, 150);
}

let autoScrollInterval = null;

function handleTouchMove(e) {
    if (!dragSourceEl) return;
    
    const touch = e.touches[0];
    touchCurrentY = touch.clientY;
    const deltaY = Math.abs(touchCurrentY - touchStartY);
    
    if (!dragStarted) {
        // If the user moves more than 10px before the drag timer fires,
        // we assume they wanted to scroll the page, not drag the item.
        if (deltaY > 10) {
            clearTimeout(dragTimer);
            dragSourceEl = null;
        }
        return;
    }

    // If we reach here, dragStarted is true, so we prevent scrolling
    if (e.cancelable) e.preventDefault();
    
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
    clearTimeout(dragTimer);
    if (!dragSourceEl) return;
    
    clearInterval(autoScrollInterval);
    autoScrollInterval = null;
    
    if (dragStarted) {
        dragSourceEl.classList.remove('dragging');
        finishReorder();
    }
    
    dragSourceEl = null;
    dragStarted = false;
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
window.editHistoryPerformance = editHistoryPerformance;
window.selectWorkout = selectWorkout;
