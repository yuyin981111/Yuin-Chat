       // ====== 你的专属身份配置 ======
let MY_USER_ID = localStorage.getItem('my_user_id');
if (!MY_USER_ID) {
    MY_USER_ID = 'u_' + Math.random().toString(36).substr(2, 6);
    localStorage.setItem('my_user_id', MY_USER_ID);
} 
        const DB_NAME = 'YumeChatProDB';
        const DB_VERSION = 5;
        let db;

        let charactersList = [];
        let currentChatId = 'default';

                let currentSettings = { 
theme: "light", dataId: generateUUID(), enableKeepAlive: "false", petEnabled: "false", petSize: 100, petSpeed: 2, petRoam: "false", petIdleUrl: "", petWalkUrl: "", petDragUrl: "", charName: "TA", userName: "我", minTime: 1.0, maxTime: 3.0, readButNoReply: "false", showFloatingBall: "true", enableStats: "true", showDotBg: "true", enableCardSplicing: "false", proactiveMsgEnabled: "false", proactiveMsgTime: 5,
    avatarShape: "square",
            avatarUrl: "", frameUrl: "", frameX: 50, frameY: 50, frameScale: 100, 
            userAvatarUrl: "", userFrameUrl: "", userFrameX: 50, userFrameY: 50, userFrameScale: 100, 
            globalFontSize: 14, customFont: "", bgWallpaper: "", bubbleCss: "", themeCss: "",
            activeReplyGroups: [],
            showTimestamp: "true", timestampPos: "pos-bottom-right", readStyle: "text"
        }; 
                let isReplying = false;

        // ====== 新增：后台保活逻辑 ======
        window.toggleKeepAlive = async function() {
            const isEnabled = document.getElementById('enableKeepAliveInput').checked;
            currentSettings.enableKeepAlive = isEnabled ? "true" : "false";
            await putToDB('settings', { key: 'config', value: currentSettings });
            applyKeepAlive();
        };

function applyKeepAlive() {
    const audio = document.getElementById('keepAliveAudio');
    if (!audio) return;
    
    // 强制设置循环播放（保活必备）
    audio.loop = true;

    if (currentSettings.enableKeepAlive === "true") {
        const playPromise = audio.play();
        
        // 挂载手机锁屏控制中心的显示信息（核心：让苹果系统认掉它）
        const setMediaSession = () => {
            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: '后台保活运行中...',
                    artist: 'YumeChat',
                    album: 'System',
                    // 你甚至可以给保活播放器配一个透明或好看的封面图标
                    artwork: [{ src: './icon.png', sizes: '512x512', type: 'image/png' }]
                });
            }
        };

        if (playPromise !== undefined) {
            playPromise.then(() => {
                setMediaSession(); // 如果安卓直接成功了，挂载信息
            }).catch(error => {
                // 如果被 iOS 拦截，挂上万能解锁器
                const unlockAudio = () => {
                    audio.play().then(() => {
                        setMediaSession(); // 解锁成功后挂载信息
                        document.removeEventListener('touchstart', unlockAudio);
                        document.removeEventListener('touchend', unlockAudio);
                        document.removeEventListener('click', unlockAudio);
                    }).catch(e => console.log("保活音频解锁失败", e)); 
                };
                
                // 必须带上 { passive: false } 否则某些高版本 iOS 不认账
                document.addEventListener('touchstart', unlockAudio, { passive: false });
                document.addEventListener('touchend', unlockAudio, { passive: false });
                document.addEventListener('click', unlockAudio, { passive: false });
            });
        }
    } else {
        audio.pause();
    }
}
        let isBatchMode = false; // 连发模式状态变量
        let customPokeList = []; // 存储自定义戳一戳
        
        let currentQuoteData = null;
function showInputQuotePreview() {
    if (!currentQuoteData) return;
    const preview = document.getElementById('inputQuotePreview');
    document.getElementById('inputQuoteName').innerText = `回复 ${currentQuoteData.name}：`;
    document.getElementById('inputQuoteText').innerText = currentQuoteData.text ? currentQuoteData.text : '[图片]';
    preview.style.display = 'flex';
}
function clearQuote() {
    currentQuoteData = null;
    document.getElementById('inputQuotePreview').style.display = 'none';
}

        // 切换连发模式
        function toggleBatchMode() {
            isBatchMode = !isBatchMode;
            const btn = document.getElementById('batchModeBtn');
            if (isBatchMode) {
                btn.classList.add('active-batch');
            } else {
                btn.classList.remove('active-batch');
                // 关闭连发时，把所有暂存的虚线框恢复为正常实线
                document.querySelectorAll('.batch-queued').forEach(el => el.classList.remove('batch-queued'));
                // 如果有暂存的未读消息，立刻一次性触发梦角的已读和回复流程！
                if (document.querySelectorAll('.new-read-flag').length > 0) {
                    simulateReadAndReply();
                }
            }
        }

        // ====== 字体防卡顿核心引擎 ======
        let activeFontBlobUrl = null; 
        function getFontBlobUrl(base64Data) {
            if (!base64Data) return null;
            if (base64Data.startsWith('blob:')) return base64Data;
            try {
                const parts = base64Data.split(',');
                const mime = parts[0].match(/:(.*?);/)[1];
                const bstr = atob(parts[1]);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while(n--) { u8arr[n] = bstr.charCodeAt(n); }
                const blob = new Blob([u8arr], {type: mime});
                return URL.createObjectURL(blob);
            } catch(e) {
                console.error("字体解析失败", e);
                return null;
            }
        }
        // ==================================
        let messageOffset = 0;
        const PAGE_SIZE = 50;
        let allMessagesCache = [];
        const DEFAULT_CARDS = [];

        function generateUUID() { return 'yume-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36); }

        function initDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = (event) => {
                    db = event.target.result;
                    if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
                    if (!db.objectStoreNames.contains('wordCards')) db.createObjectStore('wordCards', { keyPath: 'id', autoIncrement: true });
                    if (!db.objectStoreNames.contains('stickers')) db.createObjectStore('stickers', { keyPath: 'id', autoIncrement: true });
                    if (!db.objectStoreNames.contains('messages')) {
                        const msgStore = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
                        msgStore.createIndex('timestamp', 'timestamp', { unique: false });
                    }
                };
                request.onsuccess = async (event) => {
                    db = event.target.result;
                    const existingCards = await getAllFromDB('wordCards');
                    if (existingCards.length === 0) for (let c of DEFAULT_CARDS) await putToDB('wordCards', c);
                await loadSettings();
await loadMessages(true); 
if (currentSettings.enableStats !== "false") {
    renderStarList('day'); // 后台预加载数据统计与收藏，防止第一次点开闪烁
}
resolve();
                };
            });
        }

        function getFromDB(store, key) { return new Promise(res => { const req = db.transaction(store).objectStore(store).get(key); req.onsuccess = () => res(req.result); }); }
        function putToDB(store, data) { return new Promise(res => { const req = db.transaction(store, 'readwrite').objectStore(store).put(data); req.onsuccess = () => res(); }); }
        function deleteFromDB(store, id) { return new Promise(res => { const req = db.transaction(store, 'readwrite').objectStore(store).delete(id); req.onsuccess = () => res(); }); }
        function getAllFromDB(store) { return new Promise(res => { const req = db.transaction(store).objectStore(store).getAll(); req.onsuccess = () => res(req.result); }); }
        function clearDBStore(store) { return new Promise(res => { const req = db.transaction(store, 'readwrite').objectStore(store).clear(); req.onsuccess = () => res(); }); }

        window.onload = async () => {
            await initDB();
            
            

            setTimeout(() => {
                const splash = document.getElementById('splashScreen');
                splash.style.opacity = '0';
                setTimeout(() => splash.style.display = 'none', 300);
                scrollToBottom(true);
            }, 1000);
        }

        async function toggleTheme() {
    const body = document.documentElement;
    // 智能判断：如果没记录则根据手机系统深浅色来决定第一次反转
    const isCurrentlyDark = body.dataset.theme === 'dark' || (!body.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const newTheme = isCurrentlyDark ? 'light' : 'dark';
    
    body.dataset.theme = newTheme;
    currentSettings.theme = newTheme;
    await putToDB('settings', { key: 'config', value: currentSettings });
}

        function switchTab(tabId) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            event.target.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        }

        function adjNum(id, delta) {
            const el = document.getElementById(id);
            let val = parseInt(el.value) || 0;
            let min = parseInt(el.min) || 0;
            let max = parseInt(el.max) || 100;
            val += delta;
            if (val < min) val = min;
            if (val > max) val = max;
            el.value = val;
            updateAvatarPreview();
        }

        function updateInputDisplay(inputId, val) {
            const el = document.getElementById(inputId);
            if(!el) return;
            if(val && val.startsWith('data:')) {
                el.value = '[已加载本地图包 - 勿修改]';
                el.style.color = "green";
            } else {
                el.value = val || "";
                el.style.color = "var(--text-color)";
            }
        }

        function handleManualUrl(key, inputId) {
            const val = document.getElementById(inputId).value;
            if (val !== '[已加载本地图包 - 勿修改]') {
                currentSettings[key] = val;
                document.getElementById(inputId).style.color = "var(--text-color)";
                updateAvatarPreview();
            }
        }

        function handleFileToSettings(e, key, inputId) {
            const file = e.target.files[0];
            if(!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                currentSettings[key] = event.target.result;
                updateInputDisplay(inputId, currentSettings[key]);
                updateAvatarPreview();
            };
            reader.readAsDataURL(file);
            e.target.value = ''; 
        }
        
        function clearAvatarFrame(key, inputId) {
            currentSettings[key] = "";
            const el = document.getElementById(inputId);
            if(el) {
                el.value = "";
                el.style.color = "var(--text-color)";
            }
            updateAvatarPreview();
        }

        function updateFontSizePreview() {
            const size = document.getElementById('globalFontSize').value;
            document.getElementById('fontSizeVal').innerText = size;
            document.body.style.fontSize = size + 'px'; 
        }

        function updateFontWeightPreview() {
            const enabled = document.getElementById('enableFontWeightInput').checked;
            const weight = document.getElementById('globalFontWeight').value;
            document.getElementById('fontWeightVal').innerText = weight;
            
            const group = document.getElementById('fontWeightGroup');
            if (enabled) {
                // 开关打开：强制应用滑条的字重，滑条高亮
                document.getElementById('customFontWeightCss').innerHTML = `* { font-weight: ${weight} !important; }`;
                group.style.opacity = '1';
                group.style.pointerEvents = 'auto';
            } else {
                // 开关关闭：清空样式不干涉字体，滑条变暗并禁用
                document.getElementById('customFontWeightCss').innerHTML = '';
                group.style.opacity = '0.5';
                group.style.pointerEvents = 'none';
            }
        }

        function handleFontUpload(e) {
            const file = e.target.files[0];
            if(!file) return;
            
            // 1. 立即生成 Blob URL 供当前页面零延迟使用
            activeFontBlobUrl = URL.createObjectURL(file);
            document.getElementById('fontStatusText').innerText = "当前: 已加载自定义字体";
            document.getElementById('fontStatusText').style.color = "green";
            
            // 2. 后台慢慢转 Base64 存入数据库，防止卡死 UI
            const reader = new FileReader();
            reader.onload = (event) => {
                currentSettings.customFont = event.target.result;
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        }
        
        function clearFont() {
            currentSettings.customFont = "";
            activeFontBlobUrl = null;
            document.getElementById('fontStatusText').innerText = "当前: 系统默认字体";
            document.getElementById('fontStatusText').style.color = "gray";
        }

        function handleBgUpload(e) {
            const file = e.target.files[0];
            if(!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                currentSettings.bgWallpaper = event.target.result;
                document.getElementById('bgStatusText').innerText = "当前: 已加载自定义壁纸";
                document.getElementById('bgStatusText').style.color = "green";
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        }
        function clearBg() {
            currentSettings.bgWallpaper = "";
            document.getElementById('bgStatusText').innerText = "当前: 默认漫画网点";
            document.getElementById('bgStatusText').style.color = "gray";
        }

        function applyAppearance() {
            document.body.style.fontSize = (currentSettings.globalFontSize || 14) + 'px';
            if (currentSettings.enableFontWeight === "true") {
                document.getElementById('customFontWeightCss').innerHTML = `* { font-weight: ${currentSettings.globalFontWeight || 900} !important; }`;
            } else {
                document.getElementById('customFontWeightCss').innerHTML = '';
            }
            
            document.documentElement.style.setProperty('--btn-radius', currentSettings.btnShape || '50%');
document.documentElement.style.setProperty('--bg-pattern', currentSettings.showDotBg === "false" ? 'none' : '');

            // 判断应该用内存里的短指针，还是把数据库的长文本转换成短指针
            let fontSrc = "";
            if (activeFontBlobUrl) {
                fontSrc = activeFontBlobUrl;
            } else if (currentSettings.customFont) {
                activeFontBlobUrl = getFontBlobUrl(currentSettings.customFont);
                fontSrc = activeFontBlobUrl;
            }

            if(fontSrc) {
                document.getElementById('customFontCss').innerHTML = `
                    @font-face { font-family: 'MyYumeFont'; src: url('${fontSrc}'); font-display: swap; }
                    * { font-family: 'MyYumeFont', 'Helvetica Neue', Helvetica, 'PingFang SC', sans-serif !important; }
                `;
            } else {
                document.getElementById('customFontCss').innerHTML = '';
            }
            
            if(currentSettings.bgWallpaper) {
                document.body.style.backgroundImage = `url(${currentSettings.bgWallpaper})`;
                document.body.style.backgroundSize = 'cover';
                document.body.style.backgroundPosition = 'center';
            } else {
                document.body.style.backgroundImage = 'var(--bg-pattern)';
                document.body.style.backgroundSize = 'var(--bg-size)';
            }

                        document.getElementById('customBubbleCss').innerHTML = currentSettings.bubbleCss ? currentSettings.bubbleCss : '';
            // 自动加载预设的气泡样式，叠加进去
            if (currentSettings.bubblePresetCss) {
                document.getElementById('customBubbleCss').innerHTML += `\n${currentSettings.bubblePresetCss}`;
            }
            document.getElementById('customThemeCss').innerHTML = currentSettings.themeCss ? currentSettings.themeCss : '';
            
            // 自动加载预设的底栏输入框样式
            const customInputStyle = document.getElementById('customInputCss');
            if (customInputStyle) customInputStyle.innerHTML = currentSettings.inputPresetCss || '';
    document.body.classList.remove('theme-wechat', 'theme-imessage', 'theme-pink', 'theme-glass', 'theme-magazine', 'theme-journal');
    if (currentSettings.themeStyle === 'wechat') {
    document.body.classList.add('theme-wechat');
} else if (currentSettings.themeStyle === 'imessage') {
    document.body.classList.add('theme-imessage');
} else if (currentSettings.themeStyle === 'pink') {
    document.body.classList.add('theme-pink');
} else if (currentSettings.themeStyle === 'glass') {
    document.body.classList.add('theme-glass');
} else if (currentSettings.themeStyle === 'magazine') {
    document.body.classList.add('theme-magazine');
} else if (currentSettings.themeStyle === 'journal') {
    document.body.classList.add('theme-journal'); // 👉 增加这三行
}
    }
        
    async function loadSettings() {
            const data = await getFromDB('settings', 'config');
            if (data) currentSettings = { ...currentSettings, ...data.value };
            if (!currentSettings.dataId) currentSettings.dataId = generateUUID();

            // --- 角色系统初始化 ---
            const charsData = await getFromDB('settings', 'charactersList');
            if (charsData) {
                charactersList = charsData.value;
            } else {
                charactersList = [{
                    id: 'default', name: currentSettings.charName || 'TA',
                    avatarUrl: currentSettings.avatarUrl || '', frameUrl: currentSettings.frameUrl || '',
                    frameX: currentSettings.frameX || 50, frameY: currentSettings.frameY || 50, frameScale: currentSettings.frameScale || 100
                }];
                await putToDB('settings', { key: 'charactersList', value: charactersList });
            }
            const curChatData = await getFromDB('settings', 'currentChatId');
            if (curChatData) {
                currentChatId = curChatData.value;
            } else {
                currentChatId = 'default';
                await putToDB('settings', { key: 'currentChatId', value: currentChatId });
            }
            let activeChar = charactersList.find(c => c.id === currentChatId);
            if (!activeChar) { activeChar = charactersList[0]; currentChatId = activeChar.id; }
            currentSettings.charName = activeChar.name;
            currentSettings.avatarUrl = activeChar.avatarUrl;
            currentSettings.frameUrl = activeChar.frameUrl;
            currentSettings.frameX = activeChar.frameX;
            currentSettings.frameY = activeChar.frameY;
            currentSettings.frameScale = activeChar.frameScale;
            // ---------------------

            // --- 读取戳一戳记录 ---
            const pokeData = await getFromDB('settings', 'customPokeList');
            if (pokeData) customPokeList = pokeData.value;

            document.getElementById('charNameInput').value = currentSettings.charName || "TA";
            document.getElementById('userNameInput').value = currentSettings.userName || "我";
            renderHeaderLayout();
            
            document.getElementById('minTime').value = currentSettings.minTime || 1.0;
            document.getElementById('maxTime').value = currentSettings.maxTime || 3.0;if(document.getElementById('choiceDelayInput')){
    document.getElementById('choiceDelayInput').value = currentSettings.choiceDelay || 3;
    document.getElementById('choiceDelayVal').innerText = currentSettings.choiceDelay || 3;
}
            if (document.getElementById('readButNoReplyInput')) document.getElementById('readButNoReplyInput').checked = (currentSettings.readButNoReply === "true");
            if (document.getElementById('enableCardSplicingInput')) document.getElementById('enableCardSplicingInput').checked = (currentSettings.enableCardSplicing === "true");
            if (document.getElementById('showFloatingBallInput')) document.getElementById('showFloatingBallInput').checked = (currentSettings.showFloatingBall === "true");
            if (document.getElementById('showSideToolbarInput')) document.getElementById('showSideToolbarInput').checked = (currentSettings.showSideToolbar !== "false");
            // 新增：读取保活开关并立刻启动
if (document.getElementById('enableKeepAliveInput')) {
    document.getElementById('enableKeepAliveInput').checked = (currentSettings.enableKeepAlive === "true");
}
applyKeepAlive(); 
            if (document.getElementById('proactiveMsgEnabledInput')) document.getElementById('proactiveMsgEnabledInput').checked = (currentSettings.proactiveMsgEnabled === "true");
if (document.getElementById('proactiveMsgTimeInput')) {
    document.getElementById('proactiveMsgTimeInput').value = currentSettings.proactiveMsgTime || 5;
    document.getElementById('proactiveMsgTimeVal').innerText = currentSettings.proactiveMsgTime || 5;
}
if (document.getElementById('enableStatsInput')) document.getElementById('enableStatsInput').checked = (currentSettings.enableStats !== "false");
if (document.getElementById('showDotBgInput')) document.getElementById('showDotBgInput').checked = (currentSettings.showDotBg !== "false");
updateFloatingBallVisibility();
if (document.getElementById('enablePetToggle')) {
    document.getElementById('enablePetToggle').checked = (currentSettings.petEnabled === "true");
    document.getElementById('petSizeInput').value = currentSettings.petSize || 100;
    document.getElementById('petSpeedInput').value = currentSettings.petSpeed !== undefined ? currentSettings.petSpeed : 2;
    document.getElementById('petRoamToggle').checked = (currentSettings.petRoam === "true");
    updateInputDisplay('petIdleUrlInput', currentSettings.petIdleUrl);
    updateInputDisplay('petWalkUrlInput', currentSettings.petWalkUrl);
    updateInputDisplay('petDragUrlInput', currentSettings.petDragUrl);
    document.getElementById('petSizeVal').innerText = currentSettings.petSize || 100;
    document.getElementById('petSpeedVal').innerText = currentSettings.petSpeed || 2;
    applyPetCore(); // 启动宝宝
}
            document.getElementById('dataIdInput').value = currentSettings.dataId;
            // 恢复夜间模式状态
if (currentSettings.theme) {
    document.documentElement.dataset.theme = currentSettings.theme;
}

            // 恢复悬浮球位置记忆
            if (currentSettings.ballLeft && currentSettings.ballTop) {
                const ball = document.getElementById('floatingBall');
                ball.style.left = currentSettings.ballLeft;
                ball.style.top = currentSettings.ballTop;
                ball.style.right = 'auto'; // 清除初始居右的属性
            }
            // 恢复悬浮球的外观与图片参数
            updateInputDisplay('ballImgUrlInput', currentSettings.ballImgUrl);
            if (document.getElementById('ballShapeInput')) document.getElementById('ballShapeInput').value = currentSettings.ballShape || "circle";
            if (document.getElementById('ballSizeInput')) {
                document.getElementById('ballSizeInput').value = currentSettings.ballSize || 44;
                document.getElementById('ballSizeVal').innerText = currentSettings.ballSize || 44;
            }
            applyFloatingBallStyle(); // 执行外观更新
            
            updateInputDisplay('avatarUrlInput', currentSettings.avatarUrl);
            updateInputDisplay('frameUrlInput', currentSettings.frameUrl);
            document.getElementById('frameX').value = currentSettings.frameX || 50;
            document.getElementById('frameY').value = currentSettings.frameY || 50;
            document.getElementById('frameScale').value = currentSettings.frameScale || 100;
            
            updateInputDisplay('userAvatarUrlInput', currentSettings.userAvatarUrl);
            updateInputDisplay('userFrameUrlInput', currentSettings.userFrameUrl);
            document.getElementById('userFrameX').value = currentSettings.userFrameX || 50;
            document.getElementById('userFrameY').value = currentSettings.userFrameY || 50;
            document.getElementById('userFrameScale').value = currentSettings.userFrameScale || 100;

            document.getElementById('avatarShapeInput').value = currentSettings.avatarShape || "square";

            document.getElementById('showTimestampInput').value = currentSettings.showTimestamp !== undefined ? currentSettings.showTimestamp : "true";
            document.getElementById('timestampPosInput').value = currentSettings.timestampPos || "pos-bottom-right";
            document.getElementById('readStyleInput').value = currentSettings.readStyle || "text";

            document.getElementById('globalFontSize').value = currentSettings.globalFontSize || 14;
            document.getElementById('fontSizeVal').innerText = currentSettings.globalFontSize || 14;
            
            if (document.getElementById('globalFontWeight')) {
                document.getElementById('enableFontWeightInput').checked = (currentSettings.enableFontWeight === "true");
                document.getElementById('globalFontWeight').value = currentSettings.globalFontWeight || 900;
                document.getElementById('fontWeightVal').innerText = currentSettings.globalFontWeight || 900;
                updateFontWeightPreview(); // 刷新一下面板状态
            }
            
            if (document.getElementById('btnShapeInput')) document.getElementById('btnShapeInput').value = currentSettings.btnShape || "50%";

            document.getElementById('fontStatusText').innerText = currentSettings.customFont ? "当前: 已加载自定义字体" : "当前: 系统默认字体";
            document.getElementById('fontStatusText').style.color = currentSettings.customFont ? "green" : "gray";
            document.getElementById('bgStatusText').innerText = currentSettings.bgWallpaper ? "当前: 已加载自定义壁纸" : "当前: 默认漫画网点";
            document.getElementById('bgStatusText').style.color = currentSettings.bgWallpaper ? "green" : "gray";

            document.getElementById('cssBubbleInput').value = currentSettings.bubbleCss || "";
            document.getElementById('cssThemeInput').value = currentSettings.themeCss || "";

                updateSliders();
    updateAvatarPreview();
    applyAppearance();

    // 【在这里加上这句，确保刚打开网页也能显示】
    setTimeout(refreshInterpretIcon, 500);
    resetProactiveTimer(); // 初始化启动定时器
}

// === 通知与主动发消息引擎 ===
function requestNotifyPerm() {
    if (!("Notification" in window)) {
        showCustomConfirm("您的浏览器不支持通知功能", ()=>{});
        return;
    }
    Notification.requestPermission().then(perm => {
        if (perm === "granted") {
            // 授权成功，直接发一条真实系统通知测试！
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification("测试通知", {
                    body: "通知权限已开启！完美收到消息啦~",
                    icon: './icon.png',
                    vibrate: [200, 100, 200]
                });
            });
        } else {
            showCustomConfirm("权限被拒绝，请在手机系统设置里允许浏览器的通知权限。", ()=>{});
        }
    });
}

let lastNotifyTime = 0;
function notifyUser(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
        if (document.hidden || !document.hasFocus()) {
            let now = Date.now();
            // 判定距离上次弹通知是否小于 3.5 秒
            let isTooFast = (now - lastNotifyTime < 3500);
            if (!isTooFast) lastNotifyTime = now; // 更新时间

            let plainText = body ? body.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ') : '[图片/表情]';
            if (plainText.trim() === '') plainText = '[新消息]';
            
            try {
                navigator.serviceWorker.ready.then(reg => {
                    reg.showNotification(title, {
                        body: plainText,
                        icon: './icon.png',
                        badge: './icon.png',
                        tag: 'yume-msg', // 核心：打上相同的标签，新消息会原地覆盖旧消息，不闪烁
                        renotify: !isTooFast, // 核心：如果连发太快，就不重新闪烁和震动
                        vibrate: isTooFast ? [] : [200, 100, 200] // 太快就不震动
                    });
                });
            } catch (e) {
                if (!isTooFast) {
                    new Notification(title, { body: plainText, icon: './icon.png', tag: 'yume-msg' });
                }
            }
        }
    }
}

let proactiveTimer = null;
function resetProactiveTimer() {
    if (proactiveTimer) clearTimeout(proactiveTimer);
    if (currentSettings.proactiveMsgEnabled === "true") {
        let mins = parseFloat(currentSettings.proactiveMsgTime) || 5;
        
        // 1. 计算基础时间（毫秒）
        let baseMs = mins * 60 * 1000;
        
        // 2. 加入活人感波动机制（-25% 到 +25% 之间随机跳动）
        // Math.random() - 0.5 会产生 -0.5 到 0.5 的随机数，再乘0.5，也就是 -0.25 到 +0.25
        let fluctuate = (Math.random() - 0.5) * 0.5; 
        let finalMs = baseMs * (1 + fluctuate);
        
        // 3. 兜底保护：再怎么随机短，也不能低于 15 秒（防崩溃防疯狂刷屏）
        if (finalMs < 15000) finalMs = 15000;

        proactiveTimer = setTimeout(() => {
            // 时间到了，触发 TA 讲话
            triggerYumeReply();
        }, finalMs);
    }
}
// =========================

        function openSettings() { 
            document.getElementById('settingsModal').style.display = 'flex';
            updateAvatarPreview();
        }
        
        function updateSliders() {
            let min = parseFloat(document.getElementById('minTime').value);
            let max = parseFloat(document.getElementById('maxTime').value);
            if (min > max) { max = min; document.getElementById('maxTime').value = max; }
            document.getElementById('minTimeVal').innerText = min.toFixed(1);
            document.getElementById('maxTimeVal').innerText = max.toFixed(1);
        }

        function updateAvatarPreview() {
            const shape = document.getElementById('avatarShapeInput').value;
            const radiusStyle = shape === 'circle' ? '50%' : '6px';

            const yUrl = currentSettings.avatarUrl; 
            const yfUrl = currentSettings.frameUrl; 
            const yx = document.getElementById('frameX').value;
            const yy = document.getElementById('frameY').value;
            const yscale = document.getElementById('frameScale').value;
            
            document.getElementById('frameXVal').innerText = yx;
            document.getElementById('frameYVal').innerText = yy;
            document.getElementById('frameScaleVal').innerText = yscale;

            const yBaseUI = document.getElementById('avatarBaseUI');
            const yFrameUI = document.getElementById('avatarFrameUI');

            yBaseUI.style.borderRadius = radiusStyle;
            if(yUrl) { yBaseUI.style.backgroundImage = `url(${yUrl})`; yBaseUI.innerText = ''; } 
            else { yBaseUI.style.backgroundImage = 'none'; yBaseUI.innerText = document.getElementById('charNameInput').value.charAt(0) || '梦'; }
            if(yfUrl) { yFrameUI.style.backgroundImage = `url(${yfUrl})`; yFrameUI.style.backgroundPosition = `${yx}% ${yy}%`; yFrameUI.style.backgroundSize = `${yscale}%`; } 
            else { yFrameUI.style.backgroundImage = 'none'; }

            const uUrl = currentSettings.userAvatarUrl; 
            const ufUrl = currentSettings.userFrameUrl; 
            const ux = document.getElementById('userFrameX').value;
            const uy = document.getElementById('userFrameY').value;
            const uscale = document.getElementById('userFrameScale').value;
            
            document.getElementById('userFrameXVal').innerText = ux;
            document.getElementById('userFrameYVal').innerText = uy;
            document.getElementById('userFrameScaleVal').innerText = uscale;

            const uBaseUI = document.getElementById('userAvatarBaseUI');
            const uFrameUI = document.getElementById('userAvatarFrameUI');

            uBaseUI.style.borderRadius = radiusStyle;
            if(uUrl) { uBaseUI.style.backgroundImage = `url(${uUrl})`; uBaseUI.innerText = ''; } 
            else { uBaseUI.style.backgroundImage = 'none'; uBaseUI.innerText = document.getElementById('userNameInput').value.charAt(0) || '我'; }
            if(ufUrl) { uFrameUI.style.backgroundImage = `url(${ufUrl})`; uFrameUI.style.backgroundPosition = `${ux}% ${uy}%`; uFrameUI.style.backgroundSize = `${uscale}%`; } 
            else { uFrameUI.style.backgroundImage = 'none'; }
        }

// 应用悬浮球的自定义外观
        function applyFloatingBallStyle() {
            const ball = document.getElementById('floatingBall');
            if(!ball) return;
            const size = currentSettings.ballSize || 44;
            const shape = currentSettings.ballShape || "circle";
            // 判断是否为本地图包字符串
            const inputVal = currentSettings.ballImgUrl || "";
            const imgUrl = (inputVal === '[已加载本地图包 - 勿修改]') ? currentSettings.ballImgUrl : inputVal;
            
            ball.style.width = size + 'px';
            ball.style.height = size + 'px';
            ball.style.borderRadius = shape === "circle" ? "50%" : "12px";
            
            const svgIcon = ball.querySelector('svg');
            if (imgUrl && imgUrl.trim() !== '') {
                ball.style.backgroundImage = `url(${imgUrl})`;
                ball.style.backgroundSize = "cover";
                ball.style.backgroundPosition = "center";
                ball.style.backgroundColor = "transparent"; // 背景透明，完美融合图片
                // 上传了图片就隐藏里面的网格图标
                if (svgIcon) svgIcon.style.display = 'none';
            } else {
                ball.style.backgroundImage = "none";
                ball.style.backgroundColor = "var(--text-color)"; // 如果没图，恢复系统黑色底色
                if (svgIcon) svgIcon.style.display = 'block';
            }
        }
        
        async function saveSettings() {
            currentSettings.charName = document.getElementById('charNameInput').value.trim() || "TA";
            currentSettings.userName = document.getElementById('userNameInput').value.trim() || "我";
            currentSettings.minTime = parseFloat(document.getElementById('minTime').value);
            currentSettings.maxTime = parseFloat(document.getElementById('maxTime').value);
            currentSettings.choiceDelay = parseInt(document.getElementById('choiceDelayInput').value) || 3;
            if (document.getElementById('readButNoReplyInput')) currentSettings.readButNoReply = document.getElementById('readButNoReplyInput').checked ? "true" : "false";
            if (document.getElementById('enableCardSplicingInput')) currentSettings.enableCardSplicing = document.getElementById('enableCardSplicingInput').checked ? "true" : "false";
            if (document.getElementById('showFloatingBallInput')) currentSettings.showFloatingBall = document.getElementById('showFloatingBallInput').checked ? "true" : "false";
            if (document.getElementById('showSideToolbarInput')) currentSettings.showSideToolbar = document.getElementById('showSideToolbarInput').checked ? "true" : "false";
            // 新增：保存保活开关
if (document.getElementById('enableKeepAliveInput')) {
    currentSettings.enableKeepAlive = document.getElementById('enableKeepAliveInput').checked ? "true" : "false";
}
applyKeepAlive();
            if (document.getElementById('proactiveMsgEnabledInput')) currentSettings.proactiveMsgEnabled = document.getElementById('proactiveMsgEnabledInput').checked ? "true" : "false";
if (document.getElementById('proactiveMsgTimeInput')) currentSettings.proactiveMsgTime = document.getElementById('proactiveMsgTimeInput').value;
resetProactiveTimer(); // 保存设置后重置一下定时器
if (document.getElementById('enableStatsInput')) currentSettings.enableStats = document.getElementById('enableStatsInput').checked ? "true" : "false";
if (document.getElementById('showDotBgInput')) currentSettings.showDotBg = document.getElementById('showDotBgInput').checked ? "true" : "false";
updateFloatingBallVisibility();
            
            // 修复图片变黑BUG：防止把图片数据错误覆盖成提示文字
            const ballImgInputVal = document.getElementById('ballImgUrlInput').value;
            if (ballImgInputVal !== '[已加载本地图包 - 勿修改]') {
                currentSettings.ballImgUrl = ballImgInputVal;
            }
            
            currentSettings.ballShape = document.getElementById('ballShapeInput').value;
            currentSettings.ballSize = document.getElementById('ballSizeInput').value;
            applyFloatingBallStyle(); // 点击保存后立即变样
            
            currentSettings.frameX = document.getElementById('frameX').value;
            currentSettings.frameY = document.getElementById('frameY').value;
            currentSettings.frameScale = document.getElementById('frameScale').value;
            
            currentSettings.userFrameX = document.getElementById('userFrameX').value;
            currentSettings.userFrameY = document.getElementById('userFrameY').value;
            currentSettings.userFrameScale = document.getElementById('userFrameScale').value;
            
            currentSettings.showTimestamp = document.getElementById('showTimestampInput').value;
            currentSettings.timestampPos = document.getElementById('timestampPosInput').value;
            currentSettings.readStyle = document.getElementById('readStyleInput').value;
            currentSettings.avatarShape = document.getElementById('avatarShapeInput').value;
            currentSettings.globalFontSize = document.getElementById('globalFontSize').value;
            if (document.getElementById('globalFontWeight')) {
                currentSettings.enableFontWeight = document.getElementById('enableFontWeightInput').checked ? "true" : "false";
                currentSettings.globalFontWeight = document.getElementById('globalFontWeight').value;
            }
            if (document.getElementById('btnShapeInput')) currentSettings.btnShape = document.getElementById('btnShapeInput').value;
            
            currentSettings.bubbleCss = document.getElementById('cssBubbleInput').value;
            currentSettings.themeCss = document.getElementById('cssThemeInput').value;
            
            renderHeaderLayout();
            await putToDB('settings', { key: 'config', value: currentSettings });

            // 同步保存当前角色专属外观
            let activeChar = charactersList.find(c => c.id === currentChatId);
            if (activeChar) {
                activeChar.name = currentSettings.charName;
                activeChar.avatarUrl = currentSettings.avatarUrl;
                activeChar.frameUrl = currentSettings.frameUrl;
                activeChar.frameX = currentSettings.frameX;
                activeChar.frameY = currentSettings.frameY;
                activeChar.frameScale = currentSettings.frameScale;
                await putToDB('settings', { key: 'charactersList', value: charactersList });
            }
            
            document.getElementById('settingsModal').style.display = 'none';
            applyAppearance();
            renderMessagesList(allMessagesCache.slice(-messageOffset)); 
        }

function openAdvancedExportModal() {
    document.getElementById('advancedExportModal').style.display = 'flex';
}

function fallbackExport(jsonString) {
    const textarea = document.createElement('textarea');
    textarea.value = jsonString;
    textarea.style.cssText = 'position:fixed; opacity:0; left:-9999px;';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(textarea);
}

async function confirmAdvancedExport() {
    document.getElementById('advancedExportModal').style.display = 'none';
    
    let exportObj = { dataId: currentSettings.dataId };
    
    let t = document.createElement('div');
    t.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:var(--text-color); color:var(--bg-color); padding:15px 25px; border-radius:8px; font-weight:900; z-index:999999; box-shadow: 4px 4px 0 var(--border-color);';
    t.innerText = '正在按需打包数据...';
    document.body.appendChild(t);

    try {
        // 1. 处理独立的大型数据表 (消息、字卡、表情包)
        const checkboxes = document.querySelectorAll('.export-cb:checked');
        for (let cb of checkboxes) {
            exportObj[cb.value] = await getAllFromDB(cb.value);
        }

        // 2. 处理 Settings 内部的核心模块 (分类导出)
        let settingsData = await getAllFromDB('settings');
        // 永远强行剥离庞大的网易云本地缓存，避免把存档搞崩
        settingsData = settingsData.filter(item => item.key !== 'neteaseCacheData' && item.key !== 'neteasePlaylistDetails' && item.key !== 'cachedMusicList');

        const subCbs = document.querySelectorAll('.export-sub:checked');
        const allowedKeys = Array.from(subCbs).map(cb => cb.value);

        let finalSettings = [];
        for (let item of settingsData) {
            if (item.key === 'config') {
                if (allowedKeys.includes('config')) finalSettings.push(item);
            } else if (item.key === 'charactersList' || item.key === 'currentChatId') {
                if (allowedKeys.includes('charactersList')) finalSettings.push(item);
            } else {
                // 打卡、记账、信件、纪念日等全部归入附加模块
                if (allowedKeys.includes('modules')) finalSettings.push(item);
            }
        }

        // 3. 数据瘦身逻辑 (剥离 Base64 图片)
        const thinning = document.getElementById('exportThinningCb').checked;
        const noImages = document.getElementById('exportNoImagesCb')?.checked;

        // 深拷贝，防止修改影响到当前正在运行的内存数据
        finalSettings = JSON.parse(JSON.stringify(finalSettings));

        // 🌟 核心改进：无论是否勾选极致瘦身，永远强行抠掉历史消息里的“冗余头像”！只保留唯一的主头像！
        if (exportObj.messages) {
            exportObj.messages.forEach(m => {
                delete m.avatarUrl; // 永远干掉历史消息里的多余头像
                delete m.frameUrl;  // 永远干掉多余头像框
            });
        }

        let configItem = finalSettings.find(item => item.key === 'config');
        if (configItem && configItem.value) {
            if (thinning) {
                delete configItem.value.customFont;
                delete configItem.value.bgWallpaper;
            }
            if (noImages) {
                // 如果勾选了极致瘦身，才清空主设置里的头像
                delete configItem.value.avatarUrl;
                delete configItem.value.frameUrl;
                delete configItem.value.userAvatarUrl;
                delete configItem.value.userFrameUrl;
                delete configItem.value.ballImgUrl;
                delete configItem.value.petIdleUrl;
                delete configItem.value.petWalkUrl;
                delete configItem.value.petDragUrl;
                delete configItem.value.sysAnniBg;
            }
        }

        if (noImages) {
            // 如果勾选了极致瘦身，才清理角色列表和聊天发送的图片
            let charsItem = finalSettings.find(item => item.key === 'charactersList');
            if (charsItem && charsItem.value) {
                charsItem.value.forEach(c => { c.avatarUrl = ""; c.frameUrl = ""; });
            }
            let anniItem = finalSettings.find(item => item.key === 'anniversaryData');
            if (anniItem && anniItem.value) {
                anniItem.value.forEach(a => { a.bgUrl = ""; });
            }
            if (exportObj.messages) {
                exportObj.messages.forEach(m => { 
                    if (m.imgUrl) m.imgUrl = null; // 清理聊天发的图片
                    if (m.quote && m.quote.imgUrl) m.quote.imgUrl = null;
                });
            }
        }

        if (thinning && allowedKeys.includes('config')) exportObj.currentChatId = currentChatId;
        exportObj.settings = finalSettings;

        const jsonString = JSON.stringify(exportObj);
        
        try {
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `YumeData_${new Date().getTime()}.json`;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
            t.innerText = '打包完成并触发下载！';
        } catch (err) {
            fallbackExport(jsonString);
            t.innerText = '下载受限，已自动复制到剪贴板！请粘贴保存。';
        }
    } catch (error) {
        t.innerText = '打包失败: ' + error.message;
    }

    setTimeout(() => t.remove(), 2500);
}

function importData(e) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const parsed = JSON.parse(event.target.result);
            showCustomConfirm("导入将覆盖本地数据，确定吗？", async () => {
                
                // 1. 恢复设置和各大模块数据
const oldConfig = await getFromDB('settings', 'config');

// 【新增：提前把本地的音乐数据保护起来】
const oldMusicList = await getFromDB('settings', 'cachedMusicList');
const oldNeteaseData = await getFromDB('settings', 'neteaseCacheData');
const oldNeteaseDetails = await getFromDB('settings', 'neteasePlaylistDetails');

await clearDBStore('settings');

// 【新增：把保护好的音乐数据重新塞回数据库】
if (oldMusicList) await putToDB('settings', oldMusicList);
if (oldNeteaseData) await putToDB('settings', oldNeteaseData);
if (oldNeteaseDetails) await putToDB('settings', oldNeteaseDetails);

                if (Array.isArray(parsed.settings)) {
                    for(let item of parsed.settings) {
                        // 【安全合并机制】：遇到 config 且有旧数据时，做一层展开合并，防止丢设置
                        if (item.key === 'config' && oldConfig) {
                            item.value = { ...oldConfig.value, ...item.value };
                        }
                        await putToDB('settings', item);
                    }
                } else if (parsed.settings) {
                    // 兼容以前的旧版残缺备份
                    await putToDB('settings', { key: 'config', value: parsed.settings });
                }
                
                // 2. 恢复字卡、消息、表情包
                await clearDBStore('wordCards'); if(parsed.wordCards) for(let c of parsed.wordCards) await putToDB('wordCards', c);
                await clearDBStore('messages'); if(parsed.messages) for(let m of parsed.messages) await putToDB('messages', m);
                await clearDBStore('stickers'); if(parsed.stickers) for(let s of parsed.stickers) await putToDB('stickers', s);
                
                let t = document.createElement('div');
                t.style.cssText = 'position:fixed; bottom:120px; left:50%; transform:translateX(-50%); background:var(--text-color); color:var(--bg-color); padding:8px 16px; border-radius:20px; font-weight:900; font-size:0.9em; z-index:999999; opacity:0; transition:opacity 0.3s; pointer-events:none; box-shadow:0 4px 10px rgba(0,0,0,0.2);';
                t.innerText = '导入成功，即将刷新...';
                document.body.appendChild(t);
                setTimeout(()=>t.style.opacity='1', 10);
                setTimeout(()=>location.reload(), 1000);
            });
        } catch(err) { 
            showCustomConfirm("格式错误：" + err, () => {}); 
        }
    };
    reader.readAsText(file); e.target.value = '';
}

function resetAllData() {
    showCustomConfirm("【严重警告】确定要彻底重置并清空所有数据吗？\n操作不可逆，请确认已导出备份！", async () => {
        // 清空本地数据库中的所有表
        await clearDBStore('settings');
        await clearDBStore('wordCards');
        await clearDBStore('messages');
        await clearDBStore('stickers');
        
        let t = document.createElement('div');
        t.style.cssText = 'position:fixed; bottom:120px; left:50%; transform:translateX(-50%); background:#ff4444; color:#fff; padding:8px 16px; border-radius:20px; font-weight:900; font-size:0.9em; z-index:999999; opacity:0; transition:opacity 0.3s; pointer-events:none; box-shadow:0 4px 10px rgba(0,0,0,0.2);';
        t.innerText = '数据已全部销毁，正在重启...';
        document.body.appendChild(t);
        setTimeout(()=>t.style.opacity='1', 10);
        setTimeout(()=>location.reload(), 1500);
    });
}

        /* ---------------- 字卡库重构逻辑 ---------------- */
        let selectedCardIds = new Set();
        let currentCategories = ["日常"]; 

        async function updateCategoriesList() {
            const cards = await getAllFromDB('wordCards');
            const cats = new Set(cards.map(c => c.category || '日常'));
            cats.add('日常'); 
            currentCategories = Array.from(cats);
        }

        async function openCardsModal() { 
            document.getElementById('cardsModal').style.display = 'flex'; 
            await updateCategoriesList();
            renderReplyGroups();
            renderCategorySelects();
            renderCardsList(); 
        }

        function renderReplyGroups() {
            const container = document.getElementById('replyGroupsRender');
            container.innerHTML = '';
            
            let activeChar = charactersList.find(c => c.id === currentChatId);
            if (!activeChar) return;
            
            // 如果该角色还没自己的独立分组，先智能继承旧的全局分组，防止断层
            if(!activeChar.activeReplyGroups || activeChar.activeReplyGroups.length === 0) {
                activeChar.activeReplyGroups = (currentSettings.activeReplyGroups && currentSettings.activeReplyGroups.length > 0) ? currentSettings.activeReplyGroups.slice() : currentCategories.slice();
                putToDB('settings', { key: 'charactersList', value: charactersList });
            }

            currentCategories.forEach(cat => {
                const isChecked = activeChar.activeReplyGroups.includes(cat);
                const lbl = document.createElement('label');
                lbl.className = 'group-checkbox-lbl';
                lbl.innerHTML = `<input type="checkbox" class="card-checkbox" value="${cat}" ${isChecked ? 'checked' : ''} onchange="toggleReplyGroup(this)"> <span>${cat}</span>`;
                container.appendChild(lbl);
            });
        }

        async function toggleReplyGroup(cb) {
            const cat = cb.value;
            let activeChar = charactersList.find(c => c.id === currentChatId);
            if (!activeChar) return;
            
            if(!activeChar.activeReplyGroups) activeChar.activeReplyGroups = [];
            if(cb.checked) {
                if(!activeChar.activeReplyGroups.includes(cat)) activeChar.activeReplyGroups.push(cat);
            } else {
                activeChar.activeReplyGroups = activeChar.activeReplyGroups.filter(c => c !== cat);
            }
            await putToDB('settings', { key: 'charactersList', value: charactersList });
        }

        function renderCategorySelects() {
            const newCatSelect = document.getElementById('newCardCategorySelect');
            const filterCatSelect = document.getElementById('filterCategory');
            const currentFilter = filterCatSelect.value;
            
            let optionsHtml = '';
            currentCategories.forEach(c => { optionsHtml += `<option value="${c}">${c}</option>`; });
            newCatSelect.innerHTML = optionsHtml;
            
            filterCatSelect.innerHTML = `<option value="ALL">全部分组</option>` + currentCategories.map(c => `<option value="${c}">${c}</option>`).join('');
            if (currentCategories.includes(currentFilter) || currentFilter === 'ALL') {
                filterCatSelect.value = currentFilter;
            }
        }

        function promptNewCategory() {
            document.getElementById('newCategoryInput').value = '';
            document.getElementById('newCategoryModal').style.display = 'flex';
            setTimeout(() => document.getElementById('newCategoryInput').focus(), 100);
        }

        function closeNewCategoryModal() {
            document.getElementById('newCategoryModal').style.display = 'none';
        }

        function confirmNewCategory() {
            const newCat = document.getElementById('newCategoryInput').value;
            if(newCat && newCat.trim() !== '') {
                const catName = newCat.trim();
                if(!currentCategories.includes(catName)) {
                    currentCategories.push(catName);
                    let activeChar = charactersList.find(c => c.id === currentChatId);
                    if(activeChar && activeChar.activeReplyGroups && !activeChar.activeReplyGroups.includes(catName)) {
                        activeChar.activeReplyGroups.push(catName);
                        putToDB('settings', { key: 'charactersList', value: charactersList });
                    }
                    renderCategorySelects();
                    document.getElementById('newCardCategorySelect').value = catName;
                    renderReplyGroups();
                }
            }
            closeNewCategoryModal();
        }

        async function batchAddNewCards() {
            const text = document.getElementById('newCardText').value.trim();
            const category = document.getElementById('newCardCategorySelect').value || "日常";
            if (!text) return;
            
            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            for(let line of lines) {
                await putToDB('wordCards', { text: line, category });
            }
            
            document.getElementById('newCardText').value = ''; 
            await updateCategoriesList();
            renderCategorySelects();
            renderReplyGroups();
            renderCardsList();
        }

        let currentCardPage = 1;
const CARDS_PER_PAGE = 30; // 每页显示30条
let lastFilterCat = null;
let lastSearchKw = null;

async function renderCardsList() {
    const listDiv = document.getElementById('cardsListRender');
    const filterCat = document.getElementById('filterCategory').value;
    const searchKw = document.getElementById('searchCardInput').value.trim().toLowerCase();
    
    // 如果切换了分类或者进行了搜索，自动重置回第一页
    if (filterCat !== lastFilterCat || searchKw !== lastSearchKw) {
        currentCardPage = 1;
        lastFilterCat = filterCat;
        lastSearchKw = searchKw;
    }

    // ✅ 1. 先在后台获取数据，这段时间屏幕保持旧画面，不会变白闪烁
    const allCards = await getAllFromDB('wordCards');

    // 2. 过滤出符合条件的字卡
    const filteredCards = allCards.filter(card => {
        const cardCat = card.category || '日常';
        if (filterCat !== 'ALL' && cardCat !== filterCat) return false;
        if (searchKw && !card.text.toLowerCase().includes(searchKw)) return false;
        return true;
    });

    const totalPages = Math.max(1, Math.ceil(filteredCards.length / CARDS_PER_PAGE));
    if (currentCardPage > totalPages) currentCardPage = totalPages;

    const paginatedCards = filteredCards.slice(0, currentCardPage * CARDS_PER_PAGE);

    // ✅ 创建一个后台虚拟容器，在内存中拼接 DOM
    const fragment = document.createDocumentFragment();

    // 3. 渲染当前页的字卡到虚拟容器
    paginatedCards.forEach(card => {
        const cardCat = card.category || '日常';
        const item = document.createElement('div');
        item.className = 'card-item';
        const isSelected = selectedCardIds.has(card.id);

        item.innerHTML = `
            <input type="checkbox" class="card-checkbox" style="margin-right: 12px;" onchange="toggleCardSelection(${card.id}, this.checked)" ${isSelected ? 'checked' : ''}>
            <div class="card-item-text"><span class="card-category-tag">[${cardCat}]</span>${card.text}</div>
            <button class="icon-btn" style="border: none; color: #ff4444; padding: 6px; box-shadow: none;" onclick="deleteCard(${card.id})">
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"></path></svg>
            </button>
        `;
        fragment.appendChild(item);
    });

    // 4. 空状态提示
    if (filteredCards.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.style.cssText = "text-align:center; opacity:0.5; font-weight:900; padding:20px; font-style:italic;";
        emptyDiv.innerText = "该分组暂无字卡数据";
        fragment.appendChild(emptyDiv);
    }

    // 5. 渲染加载更多按钮
    if (currentCardPage < totalPages) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.className = 'outline-btn';
        loadMoreBtn.style.cssText = 'margin-top: 15px; width: 100%; padding: 12px; font-size: 0.95em; border-style: dashed; border-radius: 8px;';
        loadMoreBtn.innerText = `查看更多 (${paginatedCards.length} / ${filteredCards.length})`;
        loadMoreBtn.onclick = function() {
            currentCardPage++;
            renderCardsList();
        };
        fragment.appendChild(loadMoreBtn);
    }
    
    // ✅ 6. 拼装完毕！一次性清空并替换上屏幕，0 延迟，彻底告别闪烁！
    listDiv.innerHTML = '';
    listDiv.appendChild(fragment);
}



        function toggleCardSelection(id, isChecked) {
            if(isChecked) selectedCardIds.add(id);
            else selectedCardIds.delete(id);
        }

        function toggleSelectAllCards() {
            document.querySelectorAll('#cardsListRender .card-checkbox').forEach(cb => {
                cb.checked = true;
            });
            document.querySelectorAll('#cardsListRender .icon-btn').forEach(btn => {
                const idMatch = btn.getAttribute('onclick').match(/deleteCard\((\d+)\)/);
                if(idMatch && idMatch[1]) selectedCardIds.add(parseInt(idMatch[1]));
            });
        }

        function clearCardSelection() {
            selectedCardIds.clear();
            document.querySelectorAll('#cardsListRender .card-checkbox').forEach(cb => cb.checked = false);
        }

        async function deleteSelectedCards() {
            if(selectedCardIds.size === 0) return;
            if(!confirm(`确定要删除选中的 ${selectedCardIds.size} 张字卡吗？`)) return;
            for(let id of selectedCardIds) {
                await deleteFromDB('wordCards', id);
            }
            selectedCardIds.clear();
            await updateCategoriesList();
            renderCategorySelects();
            renderReplyGroups();
            renderCardsList();
        }

        async function moveSelectedCards() {
            if(selectedCardIds.size === 0) return;
            
            // 动态生成下拉框选项
            let selectHtml = currentCategories.map(c => `<option value="${c}">${c}</option>`).join('');
            
            // 动态注入一个选择弹窗
            let div = document.createElement('div');
            div.id = 'tempMoveModal';
            div.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:99999;display:flex;justify-content:center;align-items:center;';
            div.innerHTML = `
                <div style="background:var(--panel-bg);padding:20px;border:4px solid var(--border-color);border-radius:8px;width:85%;max-width:320px;box-shadow: 6px 6px 0 var(--border-color);">
                    <div style="margin-bottom:15px;text-align:center;font-weight:900;font-size:1.1em;">选择目标分组</div>
                    <select id="tempMoveSelect" style="appearance:auto;-webkit-appearance:auto;width:100%;padding:10px;margin-bottom:20px;border:3px solid var(--border-color);border-radius:6px;background:var(--bg-color);color:var(--text-color);font-weight:900;font-size:1em;outline:none;">
                        ${selectHtml}
                    </select>
                    <div style="display:flex;gap:10px;">
                        <button class="outline-btn" style="flex:1;margin:0;padding:12px;" onclick="document.getElementById('tempMoveModal').remove()">取消</button>
                        <button class="action-btn" style="flex:1;margin:0;padding:12px;border-radius:4px;font-size:1.1em;" onclick="confirmMoveCards()">确定</button>
                    </div>
                </div>
            `;
            document.body.appendChild(div);
        }

        // 弹窗点击确定的执行逻辑
        window.confirmMoveCards = async function() {
            let catName = document.getElementById('tempMoveSelect').value;
            for(let id of selectedCardIds) {
                const card = await getFromDB('wordCards', id);
                if(card) {
                    card.category = catName;
                    await putToDB('wordCards', card);
                }
            }
            selectedCardIds.clear();
            document.getElementById('tempMoveModal').remove();
            await updateCategoriesList();
            renderCategorySelects();
            renderReplyGroups();
            renderCardsList();
        }

        async function deleteCard(id) { 
            await deleteFromDB('wordCards', id); 
            selectedCardIds.delete(id);
            await updateCategoriesList();
            renderCategorySelects();
            renderReplyGroups();
            renderCardsList(); 
        }

        async function exportDeck() {
            const cards = await getAllFromDB('wordCards');
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cards));
            const dl = document.createElement('a'); dl.setAttribute("href", dataStr); dl.setAttribute("download", `YumeDeck.json`);
            document.body.appendChild(dl); dl.click(); dl.remove();
        }

        function importDeck(e) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const parsed = JSON.parse(event.target.result);
            showCustomConfirm(`检测到 ${parsed.length} 条字卡，是否导入？\n(不会覆盖现有，只会追加)`, async () => {
                for(let c of parsed) {
                    delete c.id; 
                    if(c.group && !c.category) c.category = c.group; // 兼容group
                    if(!c.category) c.category = "日常";
                    await putToDB('wordCards', c);
                }
                
                // 优雅的悬浮轻提示
                let t = document.createElement('div');
                t.style.cssText = 'position:fixed; bottom:120px; left:50%; transform:translateX(-50%); background:var(--text-color); color:var(--bg-color); padding:8px 16px; border-radius:20px; font-weight:900; font-size:0.9em; z-index:999999; opacity:0; transition:opacity 0.3s; pointer-events:none; box-shadow:0 4px 10px rgba(0,0,0,0.2);';
                t.innerText = '导入成功！';
                document.body.appendChild(t);
                setTimeout(()=>t.style.opacity='1', 10);
                setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 1500);

                await updateCategoriesList();
                renderCategorySelects();
                renderReplyGroups();
                renderCardsList();
            });
        } catch(err) { 
            showCustomConfirm("格式错误：" + err, () => {}); 
        }
    };
    reader.readAsText(file); e.target.value = '';
}

        /* ---------------- 聊天与基础逻辑 ---------------- */

        async function loadMessages(isInit = false) {
            const allMsgs = await getAllFromDB('messages');
            // 按当前角色的专属房间过滤消息
            allMessagesCache = allMsgs.filter(m => (!m.chatId && currentChatId === 'default') || m.chatId === currentChatId).sort((a, b) => a.timestamp - b.timestamp);
            if (isInit) { messageOffset = Math.min(PAGE_SIZE, allMessagesCache.length); } 
            else { messageOffset = Math.min(messageOffset + PAGE_SIZE, allMessagesCache.length); }
            renderMessagesList(allMessagesCache.slice(-messageOffset), !isInit);
        }

        function formatTime(ts) { const d = new Date(ts); return String(d.getHours()).padStart(2,'0') + ":" + String(d.getMinutes()).padStart(2,'0'); }
        function formatDate(ts) { const d = new Date(ts); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; }

function scrollToBottom(instant = false) {
    const container = document.getElementById('chatContainer');
    
    // 核心修复：如果网页在后台，强制关闭滑动动画，瞬间滚到底！
    if (document.hidden || !document.hasFocus()) {
        instant = true;
    }
    
    if(instant) {
        container.style.scrollBehavior = 'auto'; 
        container.scrollTop = container.scrollHeight;
        // 延迟把平滑滚动还给它，防备切回来太快
        setTimeout(() => { container.style.scrollBehavior = 'smooth'; }, 50); 
    } else {
        container.style.scrollBehavior = 'smooth';
        container.scrollTop = container.scrollHeight;
    }
}

        const msgInput = document.getElementById('messageInput');
        msgInput.addEventListener('focus', () => setTimeout(() => scrollToBottom(false), 300));
        window.addEventListener('resize', () => { if (document.activeElement === msgInput) scrollToBottom(false); });

                function renderMessagesList(msgs, isLoadMore = false) {
            const container = document.getElementById('chatContainer');
            
            // 🌟 修复闪屏：在操作DOM和修改高度前，强制关闭容器的平滑滑动动画！
            container.style.scrollBehavior = 'auto'; 
            
            const oldScrollHeight = container.scrollHeight;
            // 修复PWA闪屏：在清空列表前，先把正在输入中的气泡“救”出来
            const ti = document.getElementById('typingIndicator');
const tiWasInContainer = ti && ti.parentNode === container;
const tiDisplay = ti ? ti.style.display : 'none';
if (tiWasInContainer) document.body.appendChild(ti);
            container.innerHTML = '';
            
            const fragment = document.createDocumentFragment();

            if (messageOffset < allMessagesCache.length) {
                const loadBtn = document.createElement('div');
                loadBtn.className = 'load-more'; 
                // 🌟 把英文去掉了，改成舒服的中文
                loadBtn.innerText = '查看更多历史消息'; 
                loadBtn.onclick = () => loadMessages(false);
                fragment.appendChild(loadBtn);
            }

            let lastDateStr = null;

            msgs.forEach(msg => {
                const currentDateStr = formatDate(msg.timestamp);
                if (lastDateStr !== currentDateStr) {
                    const dateDiv = document.createElement('div');
                    dateDiv.className = 'visual-date-divider';
                    const d = new Date(msg.timestamp);
                    const timeStr = String(d.getHours()).padStart(2,'0') + ":" + String(d.getMinutes()).padStart(2,'0');
                    dateDiv.innerHTML = `<div class="v-time-box"><div class="v-time">${timeStr}</div><div class="v-date">${currentDateStr}</div></div>`;
                    fragment.appendChild(dateDiv);
                    lastDateStr = currentDateStr;
                }
                
                let isRead = msg.isRead !== false;
                const msgEl = createMessageElement(msg.sender, msg.text, msg.imgUrl, msg.timestamp, false, isRead, msg);
                msgEl.dataset.msgId = msg.id; 
                fragment.appendChild(msgEl);
            });

            container.appendChild(fragment);
            if (ti && tiWasInContainer) {
    container.appendChild(ti);
    ti.style.display = tiDisplay === 'flex' ? 'flex' : 'none';
}

            if (isLoadMore) {
                // 瞬间定位到之前的位置，没有任何动画！
                container.scrollTop = container.scrollHeight - oldScrollHeight;
                // 延迟 50ms 后再把平滑滚动还给它，以免影响后续正常聊天的滚动动画
                setTimeout(() => { container.style.scrollBehavior = 'smooth'; }, 50);
            } else {
                scrollToBottom(true); 
            }
            
            setTimeout(refreshInterpretIcon, 400);
        }

        function createMessageElement(sender, text, imgUrl, timestamp, isNew = false, isRead = true, extraMsgData = null) {
    if (sender === 'system') {
        const sysDiv = document.createElement('div');
        sysDiv.className = 'system-msg-box';
        sysDiv.innerHTML = `<div class="system-msg-content">${text}</div>`;
        return sysDiv;
    }

    const msgDiv = document.createElement('div');
// 如果是刚刚发送的新消息，就挂上柔和滑入动画
let animClass = '';
msgDiv.className = `message ${sender}${animClass}` + (isBatchMode && isNew && sender === 'user' ? ' batch-queued' : '');
    const radiusStyle = currentSettings.avatarShape === 'circle' ? 'border-radius: 50%;' : 'border-radius: 6px;';
    let avatarHtml = ''; let frameHtml = '';

    if (sender === 'yume') {
        const cName = extraMsgData && extraMsgData.charName ? extraMsgData.charName : currentSettings.charName;
let matchC = charactersList.find(c => c.name === cName);
const cAvatar = matchC ? matchC.avatarUrl : (extraMsgData && extraMsgData.avatarUrl !== undefined ? extraMsgData.avatarUrl : currentSettings.avatarUrl);
const cFrame = matchC ? matchC.frameUrl : (extraMsgData && extraMsgData.frameUrl !== undefined ? extraMsgData.frameUrl : currentSettings.frameUrl);

        const yNameChar = (cName && cName.length > 0) ? cName.charAt(0) : '梦';
        if (cAvatar) { avatarHtml = `<div class="avatar" style="background-image: url(${cAvatar}); color: transparent; ${radiusStyle}"></div>`; } 
        else { avatarHtml = `<div class="avatar" style="${radiusStyle}">${yNameChar}</div>`; }
        if (cFrame) { frameHtml = `<div class="avatar-frame" style="background-image: url(${cFrame}); background-position: center; background-size: 100%;"></div>`; }
    } else {
        const uNameChar = (currentSettings.userName && currentSettings.userName.length > 0) ? currentSettings.userName.charAt(0) : '我';
        if (currentSettings.userAvatarUrl) { avatarHtml = `<div class="avatar" style="background-image: url(${currentSettings.userAvatarUrl}); color: transparent; ${radiusStyle}"></div>`; } 
        else { avatarHtml = `<div class="avatar" style="${radiusStyle}">${uNameChar}</div>`; }
        if (currentSettings.userFrameUrl) { frameHtml = `<div class="avatar-frame" style="background-image: url(${currentSettings.userFrameUrl}); background-position: ${currentSettings.userFrameX || 50}% ${currentSettings.userFrameY || 50}%; background-size: ${currentSettings.userFrameScale || 100}%;"></div>`; }
    }

    let nameTag = '';
    if (sender === 'yume') {
        let activeChar = charactersList.find(c => c.id === currentChatId);
        if (activeChar && activeChar.groupMembers && activeChar.groupMembers.length > 0) {
            const cName = extraMsgData && extraMsgData.charName ? extraMsgData.charName : currentSettings.charName;
            nameTag = `<div style="font-size:0.7em; font-weight:900; opacity:0.6; margin-bottom:4px; margin-left:6px; display:flex; align-items:center; gap:4px; letter-spacing:0.5px;"><svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" fill="none" stroke-width="3"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>${cName}</div>`;
        }
    }

    let contentHtml = `<div class="avatar-container">${avatarHtml}${frameHtml}</div>
                       <div style="display:flex; flex-direction:column; max-width:88%;">
                           ${nameTag}
                           <div class="msg-content" style="max-width:100%;">`;
    
    let quoteHtml = '';
if (extraMsgData && extraMsgData.quote) {
    const q = extraMsgData.quote;
    const qImg = q.imgUrl ? `<img src="${q.imgUrl}" class="quote-img" />` : '';
    const qText = q.text ? `<div class="quote-text">${q.text}</div>` : '';
    quoteHtml = `<div class="quote-box"><div class="quote-name">${q.name}</div>${qText}${qImg}</div>`;
}

let bubbleHtml = ""; let imgLoadAttr = isNew ? 'onload="window.scrollToBottom && scrollToBottom(false)"' : '';
let isSpecialCard = text && (text.includes('checkin-chat-card') || text.includes('red-packet-card') || text.includes('sudden-thought-card') || text.includes('event-card') || text.includes('music-chat-card'));
let bClass = isSpecialCard ? '' : 'bubble';

if (text && imgUrl) { 
    bubbleHtml = `<div class="${bClass}" style="display: flex; flex-direction: column; gap: 8px;">${quoteHtml}<div>${text}</div><img src="${imgUrl}" style="max-width: 150px; border-radius: 4px; border: 2px solid var(--border-color);" ${imgLoadAttr} /></div>`; 
} 
else if (text) { 
    bubbleHtml = `<div class="${bClass}" style="${quoteHtml ? 'display: flex; flex-direction: column;' : ''}">${quoteHtml}${text}</div>`; 
} 
else if (imgUrl) { 
    if (quoteHtml) {
        bubbleHtml = `<div class="${bClass}" style="display: flex; flex-direction: column; gap: 8px;">${quoteHtml}<img src="${imgUrl}" style="max-width: 150px; border-radius: 4px; border: 2px solid var(--border-color);" ${imgLoadAttr} /></div>`;
    } else {
        bubbleHtml = `<img src="${imgUrl}" class="chat-image" ${imgLoadAttr} />`; 
    }
}
    
    let timeShowClass = currentSettings.showTimestamp === "false" ? "hidden" : "";
    let timePosClass = currentSettings.timestampPos || "pos-bottom-right";
    
    let readText = '已读';
    if (currentSettings.readStyle === 'tick_single' || currentSettings.readStyle === 'tick') { readText = `<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align: 1px; margin-right: 0;" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`; } 
    else if (currentSettings.readStyle === 'tick_double') { readText = `<svg viewBox="0 0 26 24" width="18" height="14" style="vertical-align: 1px; margin-right: 0;" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13.5l4.5 4.5L16 9" stroke-width="2.5" /><path d="M12 15l2 2L22 9" stroke-width="1.8" opacity="0.8" /></svg>`; }
    
    let opacityStyle = isRead ? "opacity: 0.8;" : "opacity: 0; transition: opacity 0.4s ease-in-out;";
    let readHtml = sender === 'user' ? `<span class="read-status ${isRead ? '' : 'new-read-flag'}" style="${opacityStyle}">${readText}</span>` : "";
    
    let timeHtml = `<div class="timestamp-container ${timePosClass} ${timeShowClass}">${sender === 'user' ? readHtml : ''}<span>${formatTime(timestamp)}</span>${sender !== 'user' ? readHtml : ''}</div>`;
                    
    contentHtml += bubbleHtml + timeHtml + `</div></div>`;
    msgDiv.innerHTML = `<input type="checkbox" class="msg-checkbox">` + contentHtml;
    return msgDiv;
}

async function saveAndRenderMsg(sender, text, imgUrl, ts, isNew = true, replierObj = null, quoteData = null) {
    let isRead = sender === 'user' && isNew ? false : true;
    const msg = { id: ts + Math.floor(Math.random()*10000), sender, text, imgUrl, timestamp: ts, isRead: isRead, chatId: currentChatId };
    
    if (quoteData) msg.quote = quoteData;

if (replierObj) {
    msg.charName = replierObj.name;
    // 🌟 核心优化：彻底切断源头！不再把庞大的头像和头像框存进每一条聊天记录里
    // 渲染系统会自动根据 charName 去读取唯一的那个头像，实现“全局共用”
}

await putToDB('messages', msg);
    
    const container = document.getElementById('chatContainer');
    const currentDateStr = formatDate(ts);
    
    let needDateDivider = true;
    if(allMessagesCache.length > 0) {
        const lastMsg = allMessagesCache[allMessagesCache.length - 1];
        if(formatDate(lastMsg.timestamp) === currentDateStr) { needDateDivider = false; }
    }
    
    allMessagesCache.push(msg); messageOffset++; 
    
    if(needDateDivider) {
        const dateDiv = document.createElement('div');
        dateDiv.className = 'visual-date-divider';
        const d = new Date(ts);
        const timeStr = String(d.getHours()).padStart(2,'0') + ":" + String(d.getMinutes()).padStart(2,'0');
        dateDiv.innerHTML = `<div class="v-time-box"><div class="v-time">${timeStr}</div><div class="v-date">${currentDateStr}</div></div>`;
        container.appendChild(dateDiv);
    }

        const msgEl = createMessageElement(sender, text, imgUrl, ts, isNew, isRead, msg);
    msgEl.dataset.msgId = msg.id; 
    container.appendChild(msgEl);
    scrollToBottom(false); 
    
    // 【在这里加上这句】
    setTimeout(refreshInterpretIcon, 400);
    
    // 每次有新消息都重置主动发消息的倒计时
    resetProactiveTimer();
    // 如果是TA发的消息，且网页在后台，尝试弹系统通知
    if (isNew && sender !== 'user') {
        let nTitle = (replierObj ? replierObj.name : msg.charName) || currentSettings.charName || "TA";
        notifyUser(nTitle, text || (imgUrl ? "[图片/表情]" : ""));
    }
}

        // -------- 移植自回声(Echo)的数据库持久化+批量已读机制 --------
        let isSimulatingRead = false; 

        async function simulateReadAndReply() {
            if (isSimulatingRead) return; 
            isSimulatingRead = true;
            
            // 1. 模拟回声的已读延迟 (500ms ~ 2000ms)
            const readDelay = Math.random() * 1500 + 500;
            await new Promise(res => setTimeout(res, readDelay));
            
            // 2. 批量将数据库中的未读消息持久化标记为已读
            let updated = false;
            for (let i = allMessagesCache.length - 1; i >= 0; i--) {
                if (allMessagesCache[i].sender === 'user' && allMessagesCache[i].isRead === false) {
                    allMessagesCache[i].isRead = true;
                    // 同步更新到 IndexedDB 数据库，刷新网页后状态也不会丢失
                    await putToDB('messages', allMessagesCache[i]);
                    updated = true;
                }
            }
            
    // 3. 瞬间将屏幕上所有的未读标记批量变亮（统一显示已读）
    if (updated) {
        let currentUnread = document.querySelectorAll('.new-read-flag');
        currentUnread.forEach(el => {
            el.style.opacity = '0.8';
            el.classList.remove('new-read-flag');
        });
    }
    
    isSimulatingRead = false; 
    
    // 开始进入打字回复引擎，交给每个人独立判定！
    triggerYumeReply();
}

function handleKeyPress(e) { 
    if (e.key === 'Enter' && !e.shiftKey) { 
        e.preventDefault(); // 阻止回车自动换行
        sendMessage(); 
    } 
}
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.innerText.trim(); // 从 value 改成 innerText获取文本
            
            // 如果没打字（输入框为空）就点击了发送键：
            if (!text) {
                // 只要处于连发模式，这一刀“空发”就会作为触发指令，结算所有暂存消息！
                if (isBatchMode) {
                    toggleBatchMode(); // 自动帮你取消左侧叠层高亮、把虚线变实，并触发对方已读和回复
                }
                return;
            }

const qData = currentQuoteData; clearQuote();
await saveAndRenderMsg('user', text, null, Date.now(), true, null, qData);
input.innerText = ''; 
            if (!isBatchMode) simulateReadAndReply(); // 连发模式下不触发对方回复
        }

        document.getElementById('imageUploadInput').addEventListener('change', function(e) {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = async function() {
                    const canvas = document.createElement('canvas');
                    let width = img.width, height = img.height;
                    if (width > 600) { height = Math.round((height * 600) / width); width = 600; }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
const qData = currentQuoteData; clearQuote();
await saveAndRenderMsg('user', '', canvas.toDataURL('image/jpeg', 0.7), Date.now(), true, null, qData);
                    if (!isBatchMode) simulateReadAndReply(); // 连发模式下不触发对方回复
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file); this.value = '';
        });

        const delay = ms => new Promise(res => setTimeout(res, ms));
        
        // 调整梦角每次回复消息数量的概率
        function getReplyCount() { 
            const r = Math.random(); 
            // 注意：下面的小数代表概率，你可以自己随意改！
            if (r < 0.60) return 1;       // 60% 概率只回 1 条
            if (r < 0.85) return 2;       // 25% 概率连发 2 条 (0.85 - 0.60 = 0.25)
            if (r < 0.95) return 3;       // 10% 概率连发 3 条 (0.95 - 0.85 = 0.10)
            if (r < 0.99) return 4;       // 4%  概率连发 4 条
            return 5;                     // 1%  概率疯狂连发 5 条
        }

async function triggerYumeReply() {
    if(isReplying) return;
    isReplying = true;
    
    const typingIndicator = document.getElementById('typingIndicator');
    const tAvatar = document.getElementById('typingAvatar');
    const tName = document.getElementById('typingName');
    
    // --- 1. 获取当前房间里的所有人 (charPool) ---
    let activeChar = charactersList.find(c => c.id === currentChatId);
    let charPool = []; 

    if (activeChar.isGroup) {
        if (activeChar.groupMembers && activeChar.groupMembers.length > 0) {
            activeChar.groupMembers.forEach(gid => {
                let member = charactersList.find(c => c.id === gid);
                if (member && !member.isGroup) charPool.push(member);
            });
        }
        if (charPool.length === 0) charPool = [activeChar]; 
    } else {
        charPool.push(activeChar);
        if (activeChar.groupMembers && activeChar.groupMembers.length > 0) {
            activeChar.groupMembers.forEach(gid => {
                let member = charactersList.find(c => c.id === gid);
                if (member && !member.isGroup) charPool.push(member);
            });
        }
    }

    // --- 2. 打乱说话顺序（避免每次都是群主先开口） ---
    charPool.sort(() => Math.random() - 0.5);

// --- AI 随机引用机制 (3% 概率，随机引用 15 条以内的 1~3 条) ---
let recentUserMsgs = allMessagesCache.filter(m => m.sender === 'user').slice(-15);
let taQuotesToUse = [];
if (Math.random() < 0.03 && recentUserMsgs.length > 0) {
    let r = Math.random(), qCount = 1;
    if (r > 0.6 && r <= 0.9) qCount = 2;
    if (r > 0.9) qCount = 3;
    qCount = Math.min(qCount, recentUserMsgs.length);
    
    // 随机抽取
    let shuffled = [...recentUserMsgs].sort(() => 0.5 - Math.random());
    let selectedForQuote = shuffled.slice(0, qCount);
    taQuotesToUse = selectedForQuote.map(msg => ({
        id: msg.id, sender: msg.sender, text: msg.text, imgUrl: msg.imgUrl, name: currentSettings.userName || '我'
    }));
}

    // --- 3. 让群里的每个人【独立】进行判定和说话 ---
    for (let replier of charPool) {
        
        // 每个人【独立的】已读不回判定 (如果在设置里开启了的话，每个人都有5%概率不说话)
        if (currentSettings.readButNoReply === "true" && Math.random() < 0.05) {
            continue; // 这个人决定潜水不说话了，直接跳过看下一个人
        }

        // 这个人决定说话，获取属于他【自己的】连发次数 (1到5条)
        const count = getReplyCount(); 

        for(let i = 0; i < count; i++) {
            
            // --- 挂载当前正在说话的这个人的头像和名字 ---
            tName.innerText = replier.name;
            if (replier.avatarUrl) {
                tAvatar.style.backgroundImage = `url(${replier.avatarUrl})`;
                tAvatar.innerText = '';
            } else {
                tAvatar.style.backgroundImage = 'none';
                tAvatar.innerText = replier.name.charAt(0) || '梦';
            }
            tAvatar.style.borderRadius = currentSettings.avatarShape === 'circle' ? '50%' : '6px';
            
            // --- 展现正在输入UI并滚到底部 ---
            document.getElementById('chatContainer').appendChild(typingIndicator); // 移入容器内部，防止挤压屏幕闪烁
            typingIndicator.style.display = 'flex';
            setTimeout(() => { if (typeof scrollToBottom === 'function') scrollToBottom(false); }, 50);

            // --- 等待这个人模拟打字的时间 ---
// 修复后台不发消息：如果页面在后台 (document.hidden)，直接跳过打字动画瞬间发送，防止被手机系统冻结！
const waitTime = document.hidden ? 50 : (Math.random() * (currentSettings.maxTime - currentSettings.minTime) + currentSettings.minTime) * 1000;
await delay(waitTime);
// 👇 --- 新增：防消息串台拦截补丁 ---
if (currentChatId !== activeChar.id) {
    typingIndicator.style.display = 'none';
    document.body.appendChild(typingIndicator); // 归位动画
    isReplying = false; // 解除回复锁定
    return; // 发现切房了，直接闭嘴，终止发送！
}
// 👆 -----------------------------
// ================= 新增：AI 5% 概率主动打电话 =================
// 如果此时没有在通电话，且随机数小于 0.05
if (Math.random() < 0.05 && !isPhoneCallActive && document.getElementById('phoneCallModal').style.display !== 'flex') {
    if (typeof aiInitiatePhoneCall === 'function') {
        aiInitiatePhoneCall(replier);
                typingIndicator.style.display = 'none';
                document.body.appendChild(typingIndicator); // 电话打断时也要归位
                isReplying = false;
                return; // 中断本次发文字的流程，全屏切入电话模式
    }
}
// ==============================================================

// 读取字卡和表情包
const allWords = await getAllFromDB('wordCards');
            const allStickers = await getAllFromDB('stickers'); 
            
            let validWords = allWords;
            // 优先读取这个人的独立分组，如果没有就拿旧全局分组兜底
            let charReplyGroups = replier.activeReplyGroups || currentSettings.activeReplyGroups; 
            if(charReplyGroups && charReplyGroups.length > 0) {
                validWords = allWords.filter(w => charReplyGroups.includes(w.category || '日常'));
            }
            
            const hasStickers = allStickers.length > 0;
            const roll = Math.random();

            let replyText = "（字卡库为空或未选中任何有效的分组）";
            if (validWords.length > 0) {
                // 如果开启了字卡拼接，且中了 15% 的概率
                if (currentSettings.enableCardSplicing === "true" && Math.random() < 0.15) {
                    const spliceCount = Math.random() < 0.5 ? 2 : 3; // 50%概率抽2条，50%概率抽3条
                    let splicedArr = [];
                    for(let k = 0; k < spliceCount; k++) {
                        splicedArr.push(validWords[Math.floor(Math.random() * validWords.length)].text);
                    }
                    replyText = splicedArr.join("，"); // 用中文逗号拼接起来
                } else {
                    // 原本的普通单抽逻辑
                    replyText = validWords[Math.floor(Math.random() * validWords.length)].text;
                }
            }
            const randomSticker = hasStickers ? allStickers[Math.floor(Math.random() * allStickers.length)].url : null;

            // 取出一个引用（如果有的话）
let currentQuote = taQuotesToUse.length > 0 ? taQuotesToUse.shift() : null;

// 3% 概率触发【戳一戳】（可单独出现也可混在消息前）
if (customPokeList.length > 0 && Math.random() < 0.03) {
    const randomPoke = customPokeList[Math.floor(Math.random() * customPokeList.length)];
    const cName = replier.name || currentSettings.charName || "TA";
    // 以系统消息发出，格式修改为 "TA 捏了捏脸"
    await saveAndRenderMsg('system', `${cName} ${randomPoke}`, null, Date.now(), true);
    await delay(500); // 稍微停顿一下更有真实感
}



// 真正发出消息
if (hasStickers) {
    if (roll < 0.05) { // 5% 概率只发纯表情 (原为10%)
        await saveAndRenderMsg('yume', '', randomSticker, Date.now(), true, replier, currentQuote);
    } else if (roll < 0.10) { // 5% 概率文字和表情在同一气泡 (原为10%)
        await saveAndRenderMsg('yume', replyText, randomSticker, Date.now(), true, replier, currentQuote);
    } else if (roll < 0.15) { // 5% 概率先发文字，再单独连发一个表情 (原为10%)
        await saveAndRenderMsg('yume', replyText, null, Date.now(), true, replier, currentQuote);
        await delay(800); 
        // 这里为了防止重复，第二条就不带引用了
        await saveAndRenderMsg('yume', '', randomSticker, Date.now(), true, replier);
    } else {
        await saveAndRenderMsg('yume', replyText, null, Date.now(), true, replier, currentQuote);
    }
} else {
    await saveAndRenderMsg('yume', replyText, null, Date.now(), true, replier, currentQuote);
}
        }
    }
    
    // 整个房间里所有想说话的人都说完了，结束回复状态
    typingIndicator.style.display = 'none';
    document.body.appendChild(typingIndicator); // 归位到外部，避免被夹在历史记录里
    isReplying = false;
}

// --- 动态注入的群聊设置系统 (支持继承与独立新群) ---
function openGroupModal() {
    let modal = document.getElementById('groupModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'groupModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:999999;display:none;justify-content:center;align-items:center;';
        modal.innerHTML = `
            <div style="background:var(--panel-bg);padding:0;border:4px solid var(--border-color);border-radius:8px;width:85%;max-width:320px;box-shadow: 6px 6px 0 var(--border-color); display:flex; flex-direction:column; animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); overflow:hidden;">
                <div style="padding:15px; border-bottom: 4px solid var(--border-color); font-weight:900; font-size:1.2em; text-align:center; font-style: italic;" id="groupModalTitle">GROUP CHAT</div>
                <div style="padding: 12px 15px; font-size: 0.8em; font-weight: 900; opacity: 0.8; text-align: center; background:var(--bg-color);" id="groupModalDesc">勾选角色加入群聊</div>
                <div id="groupMembersList" style="padding: 15px; max-height: 45vh; overflow-y: auto; display: flex; flex-direction: column; gap: 10px;"></div>
                <div style="padding: 15px; border-top: 4px solid var(--border-color); display: flex; flex-direction: column; gap: 10px;">
                    <div style="display:flex; gap:10px;" id="groupActionBtnsNormal">
                        <button class="outline-btn" style="flex:1; margin:0; padding:10px;" onclick="document.getElementById('groupModal').style.display='none'">取消</button>
                        <button class="action-btn" style="flex:1; margin:0; padding:10px; font-size: 1em; border-radius: 4px;" onclick="saveGroupMembers('current')">拉入当前</button>
                    </div>
                    <button class="outline-btn" style="margin:0; padding:10px; width:100%; color:var(--bg-color); background:var(--text-color);" id="groupActionBtnNew" onclick="saveGroupMembers('new')">+ 新建独立群聊 (全新记录)</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const listContainer = document.getElementById('groupMembersList');
    listContainer.innerHTML = '';
    
    let activeChar = charactersList.find(c => c.id === currentChatId);
    let currentGroup = activeChar.groupMembers || [];
    let available = 0;

    if (activeChar.isGroup) {
        document.getElementById('groupModalTitle').innerText = 'MANAGE GROUP';
        document.getElementById('groupModalDesc').innerText = '管理当前独立群聊成员';
        document.getElementById('groupActionBtnNew').style.display = 'none';
        document.getElementById('groupActionBtnsNormal').innerHTML = `
            <button class="outline-btn" style="flex:1; margin:0; padding:10px;" onclick="document.getElementById('groupModal').style.display='none'">取消</button>
            <button class="action-btn" style="flex:1; margin:0; padding:10px; font-size: 1em; border-radius: 4px;" onclick="saveGroupMembers('update_group')">保存修改</button>
        `;
    } else {
        document.getElementById('groupModalTitle').innerText = 'GROUP CHAT';
        document.getElementById('groupModalDesc').innerText = '将角色拉入当前或新建独立群';
        document.getElementById('groupActionBtnNew').style.display = 'block';
        document.getElementById('groupActionBtnsNormal').innerHTML = `
            <button class="outline-btn" style="flex:1; margin:0; padding:10px;" onclick="document.getElementById('groupModal').style.display='none'">取消</button>
            <button class="action-btn" style="flex:1; margin:0; padding:10px; font-size: 1em; border-radius: 4px;" onclick="saveGroupMembers('current')">拉入当前</button>
        `;
    }

    charactersList.forEach(char => {
        if (char.id === currentChatId || char.isGroup) return; // 排除自己和其他群组房间
        available++;
        const isChecked = currentGroup.includes(char.id) ? 'checked' : '';
        const item = document.createElement('label');
        item.style.cssText = 'display:flex; align-items:center; gap:12px; padding:10px; border:3px solid var(--border-color); border-radius:8px; cursor:pointer; background:var(--panel-bg); font-weight:900; transition:0.1s;';
        item.innerHTML = `
            <input type="checkbox" class="group-member-cb" value="${char.id}" ${isChecked} style="width:20px;height:20px;accent-color:var(--text-color);flex-shrink:0;">
            <div style="width:36px; height:36px; border-radius:var(--btn-radius,50%); border:2px solid var(--border-color); background-image:url(${char.avatarUrl}); background-size:cover; background-position:center; background-color:var(--bg-color); display:flex; justify-content:center; align-items:center; flex-shrink:0; font-size:0.9em; color:var(--text-color);">${char.avatarUrl ? '' : char.name.charAt(0)}</div>
            <div style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${char.name}</div>
        `;
        listContainer.appendChild(item);
    });

    if (available === 0) { listContainer.innerHTML = '<div style="text-align:center; opacity:0.5; font-weight:900; padding:20px 0;">需要先创建更多角色才能拉群哦</div>'; }
    modal.style.display = 'flex';
}

let tempNewGroupAvatarData = ''; // 存放新建群聊的头像缓存

window.saveGroupMembers = async function(mode) {
    const checkboxes = document.querySelectorAll('.group-member-cb:checked');
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);
    
    let activeChar = charactersList.find(c => c.id === currentChatId);

    if (mode === 'current' || mode === 'update_group') {
        if (activeChar) {
            activeChar.groupMembers = selectedIds;
            await putToDB('settings', { key: 'charactersList', value: charactersList });
        }
        document.getElementById('groupModal').style.display = 'none';
        if (selectedIds.length > 0) { await saveAndRenderMsg('system', mode === 'update_group' ? '群成员已更新' : '已开启当前房间多人回复', null, Date.now(), true); } 
        else { await saveAndRenderMsg('system', '已恢复单人模式', null, Date.now(), true); }
    } 
    else if (mode === 'new') {
        if (selectedIds.length === 0) { 
            // 如果连原生alert也觉得丑，这里我也给你换成自定义的提示框
            showCustomConfirm('请至少勾选一个要拉入群聊的角色！', () => {}); 
            return; 
        }
        
        // 清理上一次的头像缓存
        tempNewGroupAvatarData = '';
        
        // 隐藏掉上一个选人弹窗
        document.getElementById('groupModal').style.display = 'none';

        // 动态注入精美的新建群聊弹窗
        let div = document.createElement('div');
        div.id = 'newGroupModal';
        div.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:999999;display:flex;justify-content:center;align-items:center;';
        div.innerHTML = `
            <div style="background:var(--panel-bg);padding:20px 25px;border:4px solid var(--border-color);border-radius:8px;width:85%;max-width:320px;box-shadow: 6px 6px 0 var(--border-color); display:flex; flex-direction:column; gap:15px; animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                <div style="text-align:center;font-weight:900;font-size:1.2em;font-style:italic;letter-spacing:1px;">NEW GROUP CHAT</div>
                
                <div style="display:flex; flex-direction:column; align-items:center; gap:8px; margin-top:5px;">
                    <div id="newGroupAvatarPreview" style="width:80px;height:80px;border:4px solid var(--border-color);border-radius:var(--btn-radius, 50%);background-color:var(--bg-color);display:flex;justify-content:center;align-items:center;font-weight:900;font-size:2em;color:var(--text-color);background-size:cover;background-position:center;cursor:pointer;box-shadow: 4px 4px 0 var(--border-color);transition: transform 0.1s;" onclick="document.getElementById('newGroupAvatarInput').click()">
                        +
                    </div>
                    <div style="font-size:0.75em;font-weight:900;opacity:0.6;font-style:italic;">点击设置群头像(可选)</div>
                    <input type="file" id="newGroupAvatarInput" accept="image/*" style="display:none;" onchange="handleNewGroupAvatar(event)">
                </div>

                <div style="display:flex;flex-direction:column;gap:6px;">
                    <label style="font-weight:900;font-size:0.85em;padding-left:2px;">群聊名称</label>
                    <input type="text" id="newGroupNameInput" placeholder="例如：相亲相爱一家人..." style="width:100%;padding:12px;border:3px solid var(--border-color);border-radius:6px;background:var(--bg-color);color:var(--text-color);font-weight:900;font-size:1em;outline:none;">
                </div>

                <div style="display:flex;gap:12px;margin-top:10px;">
                    <button class="outline-btn" style="flex:1;margin:0;padding:12px;border-radius:6px;" onclick="document.getElementById('newGroupModal').remove(); document.getElementById('groupModal').style.display='flex';">取消</button>
                    <button class="action-btn" style="flex:1;margin:0;padding:12px;border-radius:6px;font-size:1.1em;" onclick="confirmCreateNewGroup('${selectedIds.join(',')}')">建群</button>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    }
};

// 处理群聊的头像上传
window.handleNewGroupAvatar = function(e) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        tempNewGroupAvatarData = event.target.result;
        const preview = document.getElementById('newGroupAvatarPreview');
        preview.style.backgroundImage = `url(${tempNewGroupAvatarData})`;
        preview.innerText = ''; // 隐藏加号
    };
    reader.readAsDataURL(file);
    e.target.value = ''; 
};

// 确定新建群聊的最终逻辑
window.confirmCreateNewGroup = async function(idsStr) {
    const nameInput = document.getElementById('newGroupNameInput').value.trim();
    if (!nameInput) { 
        showCustomConfirm('请输入群聊名字！', () => {}); 
        return; 
    }
    
    // 把当前的主视角角色也塞进新群里
    let finalIds = idsStr.split(',');
    finalIds.push(currentChatId);
    
    const newGroup = {
        id: 'group_' + Date.now(),
        name: nameInput,
        isGroup: true, // 标记为独立群聊房间
        groupMembers: finalIds,
        avatarUrl: tempNewGroupAvatarData, // 支持群头像
        frameUrl: '', frameX: 50, frameY: 50, frameScale: 100
    };
    
    charactersList.push(newGroup);
    await putToDB('settings', { key: 'charactersList', value: charactersList });
    
    tempNewGroupAvatarData = ''; // 重置内存
    document.getElementById('newGroupModal').remove(); // 关闭弹窗
    
    // 瞬间切换到新建立的空白记录群聊中！
    await switchCharacter(newGroup.id);
};
        
        /* ================= 表情包逻辑 ================= */
        async function toggleStickerPanel() {
            const panel = document.getElementById('stickerPanel');
            if (panel.style.display === 'flex') {
                panel.style.display = 'none';
            } else {
                panel.style.display = 'flex';
                // 智能判定当前在哪个 Tab，并渲染对应数据
                if(document.getElementById('spTabSticker').classList.contains('active')) {
                    await renderStickers();
                } else {
                    renderPokeList();
                }
            }
        }

        /* ================= 戳一戳系统逻辑 ================= */
        function switchStickerPanelTab(tab) {
            document.getElementById('spTabSticker').classList.remove('active');
            document.getElementById('spTabPoke').classList.remove('active');
            document.getElementById('spContentSticker').style.display = 'none';
            document.getElementById('spContentPoke').style.display = 'none';
            
            if (tab === 'sticker') {
                document.getElementById('spTabSticker').classList.add('active');
                document.getElementById('spContentSticker').style.display = 'flex';
                renderStickers();
            } else {
                document.getElementById('spTabPoke').classList.add('active');
                document.getElementById('spContentPoke').style.display = 'flex';
                renderPokeList();
            }
        }

        async function batchAddPokes() {
            const text = document.getElementById('pokeTextInput').value.trim();
            if (!text) return;
            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            customPokeList = customPokeList.concat(lines);
            await putToDB('settings', { key: 'customPokeList', value: customPokeList });
            document.getElementById('pokeTextInput').value = '';
            renderPokeList();
        }

        function renderPokeList() {
            const container = document.getElementById('pokeListRender');
            container.innerHTML = '';
            if (customPokeList.length === 0) {
                container.innerHTML = '<div style="text-align:center; opacity:0.5; font-weight:900; padding:20px;">动作库空空如也，请在上方添加</div>';
                return;
            }
            customPokeList.forEach((poke, index) => {
                const item = document.createElement('div');
                item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border:3px solid var(--border-color); border-radius:6px; background:var(--panel-bg); cursor:pointer; font-weight:900; margin-bottom:8px; box-shadow: 2px 2px 0 var(--border-color);';
                item.innerHTML = `
                    <div style="flex:1;" onclick="sendUserPoke('${poke}')">${poke}</div>
                    <button class="icon-btn" style="border:none; color:#ff4444; padding:0 5px; box-shadow:none; background:transparent;" onclick="deletePoke(${index}, event)">✖</button>
                `;
                container.appendChild(item);
            });
        }

        async function deletePoke(index, event) {
            event.stopPropagation();
            showCustomConfirm('确定要删除这条动作吗？', async () => {
                customPokeList.splice(index, 1);
                await putToDB('settings', { key: 'customPokeList', value: customPokeList });
                renderPokeList();
            });
        }

        async function sendUserPoke(pokeText) {
            document.getElementById('stickerPanel').style.display = 'none';
            const uName = currentSettings.userName || "我";
            // 格式修改：只显示 "我 捏了捏脸"，去掉了结尾的 TA
            const msgText = `${uName} ${pokeText}`;
            
            // 发出这条戳一戳
            await saveAndRenderMsg('system', msgText, null, Date.now(), true);
            
            // 恢复普通消息机制！把它当作发了一条消息，AI会正常走“已读不回”或“回复”的逻辑
            if (!isBatchMode) simulateReadAndReply();
        }

        let isStickerMulti = false;
        let selectedStickers = new Set();

        async function renderStickers() {
            const grid = document.getElementById('stickerGridRender');
            grid.innerHTML = '';
            const stickers = await getAllFromDB('stickers');
            if(stickers.length === 0) {
                grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; font-weight:900; opacity:0.5; padding: 20px;">暂无表情包，请上方添加</div>';
                return;
            }
            stickers.forEach(st => {
                const item = document.createElement('div');
                item.className = 'sticker-item';
                const isChecked = selectedStickers.has(st.id) ? 'checked' : '';
                item.innerHTML = `
                    <input type="checkbox" class="sticker-checkbox" ${isChecked} onchange="toggleStickerSel(${st.id}, this.checked)">
                    <img src="${st.url}" onclick="handleStickerClick(${st.id}, '${st.url}', this)" />
                    <div class="sticker-del-btn" onclick="deleteSticker(${st.id}, event)">X</div>
                `;
                grid.appendChild(item);
            });
        }
        
        // 切换批量管理模式
        function toggleStickerMulti() {
            isStickerMulti = !isStickerMulti;
            const grid = document.getElementById('stickerGridRender');
            const btnMulti = document.getElementById('btnStickerMulti');
            const btnAll = document.getElementById('btnStickerAll');
            const btnDel = document.getElementById('btnStickerDel');
            const tip = document.getElementById('stickerModeTip');

            if (isStickerMulti) {
                grid.classList.add('sticker-multi-mode');
                btnMulti.innerText = "退出管理";
                btnAll.style.display = "block";
                btnDel.style.display = "block";
                tip.innerText = "点击勾选表情";
            } else {
                grid.classList.remove('sticker-multi-mode');
                btnMulti.innerText = "批量管理";
                btnAll.style.display = "none";
                btnDel.style.display = "none";
                tip.innerText = "点击表情发送";
                selectedStickers.clear(); // 退出时清空选中
                renderStickers();
            }
        }

        // 处理点击事件（多选模式打勾，普通模式发送）
        function handleStickerClick(id, url, imgEl) {
            if (isStickerMulti) {
                const cb = imgEl.parentElement.querySelector('.sticker-checkbox');
                cb.checked = !cb.checked;
                toggleStickerSel(id, cb.checked);
            } else {
                sendUserSticker(url);
            }
        }

        // 记录选中的表情
        function toggleStickerSel(id, isChecked) {
            if (isChecked) selectedStickers.add(id);
            else selectedStickers.delete(id);
        }

        // 全选功能
        function selectAllStickers() {
            document.querySelectorAll('.sticker-checkbox').forEach(cb => {
                if (!cb.checked) {
                    cb.checked = true;
                    const idMatch = cb.parentElement.querySelector('.sticker-del-btn').getAttribute('onclick').match(/\d+/);
                    if (idMatch) selectedStickers.add(parseInt(idMatch[0]));
                }
            });
        }

        // 批量删除核心逻辑
        async function deleteSelectedStickers() {
            if (selectedStickers.size === 0) {
                showCustomConfirm("请先点击勾选要删除的表情包哦！", ()=>{});
                return;
            }
            showCustomConfirm(`确定要一键删除选中的 ${selectedStickers.size} 个表情包吗？`, async () => {
                for (let id of selectedStickers) {
                    await deleteFromDB('stickers', id);
                }
                selectedStickers.clear();
                await renderStickers();
                toggleStickerMulti(); // 删完自动退出管理模式
            });
        }

        async function sendUserSticker(url) {
    document.getElementById('stickerPanel').style.display = 'none'; // 发送后自动收起
    const qData = currentQuoteData; clearQuote();
    await saveAndRenderMsg('user', '', url, Date.now(), true, null, qData);
            if (!isBatchMode) simulateReadAndReply(); // 连发模式下不触发对方回复
        }

        // ----------------- 自定义弹窗系统 -----------------
function showCustomConfirm(text, onYes) {
    document.getElementById('confirmModalText').innerText = text;
    const modal = document.getElementById('customConfirmModal');
    const yesBtn = document.querySelector('#customConfirmModal .action-btn'); // 灵活抓取按钮
    
    // 智能判断：根据文字内容决定按钮颜色和文字
    if (text.includes('删除') || text.includes('销毁')) {
        yesBtn.innerText = '删除';
        yesBtn.id = 'confirmModalYesBtn'; // 赋予ID以适配深色模式红底补丁
        yesBtn.style.cssText = 'flex:1; margin:0; padding:12px; background:#ff4444; color:#fff; border-radius:6px; font-size:1.1em;';
    } else {
        yesBtn.innerText = '确定';
        yesBtn.id = 'tempNormalBtn'; // 移除特权ID，防止深色模式强行染红
        yesBtn.style.cssText = 'flex:1; margin:0; padding:12px; background:var(--text-color); color:var(--bg-color); border-radius:6px; font-size:1.1em;';
    }

    modal.style.display = 'flex';
    yesBtn.onclick = () => {
        modal.style.display = 'none';
        onYes();
    };
}
        function closeCustomConfirm() {
            document.getElementById('customConfirmModal').style.display = 'none';
        }

        // 修改后的删除表情包逻辑
        function deleteSticker(id, event) {
            event.stopPropagation();
            // 呼叫自定义弹窗
            showCustomConfirm('确定要删除该表情包吗？', async () => {
                await deleteFromDB('stickers', id);
                await renderStickers();
            });
        }

        async function batchAddStickerUrls() {
            const text = document.getElementById('stickerUrlInput').value.trim();
            if(!text) return;
            
            const lines = text.split('\n');
            for(let line of lines) {
                // 正则智能提取网址：无视前面的备注文字，精准抓取链接
                const match = line.match(/(https?:\/\/[^\s]+)/);
                if (match && match[1]) {
                    await putToDB('stickers', { url: match[1] });
                }
            }
            
            document.getElementById('stickerUrlInput').value = '';
            await renderStickers();
        }

        async function addLocalSticker(e) {
    const files = e.target.files; 
    if (!files || files.length === 0) return;
    
    // 贴心的悬浮提示
    let t = document.createElement('div');
    t.style.cssText = 'position:fixed; bottom:120px; left:50%; transform:translateX(-50%); background:var(--text-color); color:var(--bg-color); padding:8px 16px; border-radius:20px; font-weight:900; font-size:0.9em; z-index:999999; opacity:0; transition:opacity 0.3s; pointer-events:none; box-shadow:0 4px 10px rgba(0,0,0,0.2);';
    t.innerText = `正在处理 ${files.length} 张表情...`;
    document.body.appendChild(t);
    setTimeout(()=>t.style.opacity='1', 10);
    
    // 循环处理用户选中的所有图片
    for(let i = 0; i < files.length; i++) {
        const file = files[i];
        await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = async function() {
                    const canvas = document.createElement('canvas');
                    let width = img.width, height = img.height;
                    if (width > 300) { height = Math.round((height * 300) / width); width = 300; } // 压缩尺寸
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
                    const b64 = canvas.toDataURL('image/webp', 0.8);
                    await putToDB('stickers', { url: b64 });
                    resolve(); // 这张图处理完毕，进行下一张
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }
    
    e.target.value = ''; // 清空选择，防止选同样的图不触发
    await renderStickers(); // 全部存完后，一次性刷新界面
    
    // 提示完成并消失
    t.innerText = '表情包导入成功！';
    setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 1500);
}
        
                /* ================= CSS 预设库逻辑 (存入 IndexedDB) ================= */
        let cssPresetsDB = { bubble: [], theme: [] };

        // 读取预设数据
        async function loadCssPresetsData() {
            const data = await getFromDB('settings', 'cssPresetsData');
            if (data && data.value) cssPresetsDB = data.value;
            renderPresetSelect('bubble');
            renderPresetSelect('theme');
        }

        // 渲染下拉框
        function renderPresetSelect(type) {
            const sel = document.getElementById(type + 'PresetSelect');
            if(!sel) return;
            sel.innerHTML = '<option value="">- 选择预设 -</option>';
            cssPresetsDB[type].forEach((p, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.innerText = p.name;
                sel.appendChild(opt);
            });
        }

        // 保存新预设
        async function saveCssPreset(type) {
            const inputId = type === 'bubble' ? 'cssBubbleInput' : 'cssThemeInput';
            const cssVal = document.getElementById(inputId).value.trim();
            if (!cssVal) { alert('内容为空，无法保存！'); return; }
            const name = prompt('请输入你要保存的预设名称：');
            if (!name) return;
            cssPresetsDB[type].push({ name: name, css: cssVal });
            await putToDB('settings', { key: 'cssPresetsData', value: cssPresetsDB }); // 存入 IndexedDB
            renderPresetSelect(type);
            document.getElementById(type + 'PresetSelect').value = cssPresetsDB[type].length - 1;
        }

        // 切换加载预设
        function loadCssPreset(type) {
            const sel = document.getElementById(type + 'PresetSelect');
            const idx = sel.value;
            if (idx === "") return;
            const inputId = type === 'bubble' ? 'cssBubbleInput' : 'cssThemeInput';
            document.getElementById(inputId).value = cssPresetsDB[type][idx].css;
        }

        // 删除预设
        async function deleteCssPreset(type) {
            const sel = document.getElementById(type + 'PresetSelect');
            const idx = sel.value;
            if (idx === "") { alert('请先在下拉框选择一个你想删除的预设！'); return; }
            if (!confirm(`确定要删除预设 [${cssPresetsDB[type][idx].name}] 吗？`)) return;
            cssPresetsDB[type].splice(idx, 1);
            await putToDB('settings', { key: 'cssPresetsData', value: cssPresetsDB }); // 存入 IndexedDB
            renderPresetSelect(type);
            document.getElementById(type === 'bubble' ? 'cssBubbleInput' : 'cssThemeInput').value = '';
        }

        // 将读取预设函数注入到现有的开机流程中
        const originalOpenSettings = openSettings;
        openSettings = function() {
            loadCssPresetsData(); // 打开设置时自动加载一遍DB预设
            originalOpenSettings();
        };
        /* ================================================================= */

        /* 悬浮球 & 面板 拖拽及动态跟随逻辑 */
function updateFloatingBallVisibility() {
    const ball = document.getElementById('floatingBall');
    const panel = document.getElementById('appPanel');
    const sideToolbar = document.getElementById('sideToolbar'); // 抓取侧边栏
    
    // 控制悬浮球
    if (currentSettings.showFloatingBall === "true") {
        ball.style.display = 'flex';
    } else {
        ball.style.display = 'none';
        panel.style.display = 'none';
    }
    
    // 控制侧边栏的显示与隐藏
    if (sideToolbar) {
        sideToolbar.style.display = (currentSettings.showSideToolbar !== "false") ? 'flex' : 'none';
    }
    
    // 使得应用面板里的收藏夹图标始终保留
    const starBtn = document.getElementById('appStarBtn');
    const menuStarBtn = document.getElementById('msgMenuStarBtn');
    if (starBtn) starBtn.style.display = 'flex'; 
    if (menuStarBtn) menuStarBtn.style.display = currentSettings.enableStats === "false" ? 'none' : 'block';
}

        const floatingBall = document.getElementById('floatingBall');
        const appPanel = document.getElementById('appPanel');
        
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;
        let dragStartTime;
        let movedDistance = 0;

        // 绑定触摸事件 (手机端)
        floatingBall.addEventListener('touchstart', dragStart, { passive: false });
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('touchend', dragEnd);

        function dragStart(e) {
            if (e.target.closest('#floatingBall')) {
                initialLeft = floatingBall.offsetLeft;
                initialTop = floatingBall.offsetTop;
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                isDragging = true;
                movedDistance = 0;
                dragStartTime = Date.now();
                
                // 拖拽时移除吸附动画，保证跟手
                floatingBall.classList.remove('snap-anim');
            }
        }

        function dragMove(e) {
            if (!isDragging) return;
            e.preventDefault(); // 防止拖拽时背景滚动
            
            // 真正开始拖动滑动时，才收起面板
            if (appPanel.style.display === 'flex') {
                appPanel.style.display = 'none';
            }
            
            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            
            const dx = currentX - startX;
            const dy = currentY - startY;
            movedDistance = Math.max(movedDistance, Math.abs(dx), Math.abs(dy));

            // 更新位置（限制在屏幕范围内）
            let newLeft = initialLeft + dx;
            let newTop = initialTop + dy;
            
            const maxLeft = window.innerWidth - floatingBall.offsetWidth;
            const maxTop = window.innerHeight - floatingBall.offsetHeight;

            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));

            // 清除 right/bottom，彻底使用 left/top 控制
            floatingBall.style.right = 'auto';
            floatingBall.style.bottom = 'auto';
            floatingBall.style.left = newLeft + 'px';
            floatingBall.style.top = newTop + 'px';
        }

        function dragEnd(e) {
            if (!isDragging) return;
            isDragging = false;

            // 如果滑动距离小于 10 像素，且时间小于 300ms，判定为点击！
            if (movedDistance < 10 && (Date.now() - dragStartTime < 300)) {
                toggleAppPanel();
            }

            // 松开手后，开启吸附动画，并计算吸附到左边还是右边
            floatingBall.classList.add('snap-anim');
            
            const rect = floatingBall.getBoundingClientRect();
            const ballCenter = rect.left + rect.width / 2;
            const screenCenter = window.innerWidth / 2;

            if (ballCenter > screenCenter) {
                // 吸附到右侧
                floatingBall.style.left = (window.innerWidth - floatingBall.offsetWidth - 15) + 'px';
            } else {
                // 吸附到左侧
                floatingBall.style.left = '15px';
            }
            
            // 记忆悬浮球位置并保存到数据库
            currentSettings.ballLeft = floatingBall.style.left;
            currentSettings.ballTop = floatingBall.style.top;
            putToDB('settings', { key: 'config', value: currentSettings });
        }

        // 智能定位并弹开面板
        function toggleAppPanel() {
            if (appPanel.style.display === 'flex') {
                appPanel.style.display = 'none';
                return;
            }
            
            appPanel.style.display = 'flex';
            const ballRect = floatingBall.getBoundingClientRect();
            const panelWidth = 240; // 面板固定宽度
            
            // 清理旧位置
            appPanel.style.left = 'auto';
            appPanel.style.right = 'auto';
            
            // 判定：如果球在屏幕右半边，面板在球左边展开；反之在右边
            if ((ballRect.left + ballRect.width / 2) > (window.innerWidth / 2)) {
                // 球在右，面板往左弹
                appPanel.style.transformOrigin = 'top right';
                appPanel.style.right = (window.innerWidth - ballRect.left + 10) + 'px';
            } else {
                // 球在左，面板往右弹
                appPanel.style.transformOrigin = 'top left';
                appPanel.style.left = (ballRect.right + 10) + 'px';
            }

            // 高度：对齐悬浮球，并防止超出屏幕底部
            let topPos = ballRect.top;
            const maxTop = window.innerHeight - appPanel.offsetHeight - 20; // 留 20px 边距
            if (topPos > maxTop) { topPos = maxTop; }
            appPanel.style.top = topPos + 'px';
        }

        // 占位弹窗
        function appPlaceholder(appName) {
            appPanel.style.display = 'none';
            alert(`[系统提示]\n模块 <${appName}> 正在构建中，敬请期待！`);
        }

        /* ================= 电话功能核心逻辑 ================= */
        let phoneCallTimer = null;
let phoneCallSeconds = 0;
let isPhoneCallActive = false;
let callTimeoutObj = null;
let isIncomingCall = false; // 记录是否是对方打来的电话
let currentCallMembers = []; // 记录当前真正在通话中的人

// AI 主动呼叫你的函数
window.aiInitiatePhoneCall = function(replier) {
    isIncomingCall = true;
    currentCallMembers = [replier];

    document.getElementById('phoneCallModal').style.display = 'flex';
    document.getElementById('phoneStatusUI').innerText = 'INCOMING CALL...';

    document.getElementById('phoneMinBtn').style.display = 'none';
    document.getElementById('phoneAnswerBtn').style.display = 'flex'; // 显示绿色的接听按钮
    
    document.getElementById('phoneAvatarUI').classList.add('phone-pulse'); 
    
    const avatarUI = document.getElementById('phoneAvatarUI');
    if (replier.avatarUrl) {
        avatarUI.style.backgroundImage = `url(${replier.avatarUrl})`;
        avatarUI.innerText = '';
    } else {
        avatarUI.style.backgroundImage = 'none';
        avatarUI.innerText = replier.name.charAt(0) || '梦';
    }
    document.getElementById('phoneNameUI').innerText = replier.name;
    avatarUI.style.borderRadius = currentSettings.avatarShape === 'circle' ? '50%' : '16px';

    // 如果 15 秒无人接听，自动挂断并记录未接来电
    callTimeoutObj = setTimeout(async () => {
        if (isIncomingCall) {
            isIncomingCall = false;
            document.getElementById('phoneStatusUI').innerText = 'MISSED CALL';
            document.getElementById('phoneAvatarUI').classList.remove('phone-pulse');
            setTimeout(() => { document.getElementById('phoneCallModal').style.display = 'none'; }, 1500);
            await saveAndRenderMsg('system', `未接来电：${replier.name}`, null, Date.now(), true);
        }
    }, 15000);
};

// 你点击“接听”时的处理函数
window.answerIncomingCall = function() {
    clearTimeout(callTimeoutObj);
    isIncomingCall = false;
    document.getElementById('phoneAnswerBtn').style.display = 'none'; // 隐藏接听按钮
    answerPhoneCall(currentCallMembers, []); // 转入正常通话倒计时
};

function updatePhoneUI() {
    const avatarUI = document.getElementById('phoneAvatarUI');
    if (currentSettings.avatarUrl) {
        avatarUI.style.backgroundImage = `url(${currentSettings.avatarUrl})`;
        avatarUI.innerText = '';
    } else {
        avatarUI.style.backgroundImage = 'none';
        avatarUI.innerText = (currentSettings.charName && currentSettings.charName.length > 0) ? currentSettings.charName.charAt(0) : '梦';
    }
    document.getElementById('phoneNameUI').innerText = currentSettings.charName || 'TA';
    avatarUI.style.borderRadius = currentSettings.avatarShape === 'circle' ? '50%' : '16px';
}

function startPhoneCall() {
    if (document.getElementById('phoneCallModal').style.display === 'flex' || 
        document.getElementById('minimizedPhone').style.display === 'flex') {
        maximizePhoneCall();
        return;
    }
    
    isIncomingCall = false; // 确保这不是来电状态
document.getElementById('phoneCallModal').style.display = 'flex';
document.getElementById('phoneStatusUI').innerText = 'DIALING...';
document.getElementById('phoneMinBtn').style.display = 'none'; 
if(document.getElementById('phoneAnswerBtn')) document.getElementById('phoneAnswerBtn').style.display = 'none'; // 隐藏接听键
document.getElementById('phoneAvatarUI').classList.add('phone-pulse'); 
    
    updatePhoneUI(); // 初始展示房间名和头像
    
    // 1. 获取当前房间里的所有人
    let activeChar = charactersList.find(c => c.id === currentChatId);
    let charPool = []; 

    if (activeChar.isGroup) {
        if (activeChar.groupMembers && activeChar.groupMembers.length > 0) {
            activeChar.groupMembers.forEach(gid => {
                let member = charactersList.find(c => c.id === gid);
                if (member && !member.isGroup) charPool.push(member);
            });
        }
        if (charPool.length === 0) charPool = [activeChar]; 
    } else {
        charPool.push(activeChar);
        if (activeChar.groupMembers && activeChar.groupMembers.length > 0) {
            activeChar.groupMembers.forEach(gid => {
                let member = charactersList.find(c => c.id === gid);
                if (member && !member.isGroup) charPool.push(member);
            });
        }
    }
    
    // 2. 模拟拨号等待时间 2.5 ~ 5秒
    const waitTime = Math.random() * 2500 + 2500;
    callTimeoutObj = setTimeout(() => {
        
        let accepted = [];
        let rejected = [];

        // 3. 每个人独立判定 5% 的挂断率
        charPool.forEach(char => {
            if (Math.random() < 0.05) {
                rejected.push(char);
            } else {
                accepted.push(char);
            }
        });

        // 4. 根据结果分流
        if (accepted.length === 0) {
            // 如果所有人都拒绝了
            rejectPhoneCall(rejected);
        } else {
            // 只要有一个人接了，就算接通
            answerPhoneCall(accepted, rejected);
        }
    }, waitTime);
}

async function rejectPhoneCall(rejectedMembers) {
    isPhoneCallActive = false;
    document.getElementById('phoneStatusUI').innerText = 'REJECTED';
    document.getElementById('phoneAvatarUI').classList.remove('phone-pulse');
    
    setTimeout(() => { document.getElementById('phoneCallModal').style.display = 'none'; }, 1500);
    
    let names = rejectedMembers ? rejectedMembers.map(c => c.name).join('、') : '对方';
    await saveAndRenderMsg('system', `${names} 拒绝了你的通话请求`, null, Date.now(), true);
}

async function answerPhoneCall(acceptedMembers, rejectedMembers) {
    isPhoneCallActive = true;
    phoneCallSeconds = 0;
    currentCallMembers = acceptedMembers;

    document.getElementById('phoneStatusUI').innerText = '00:00';
    document.getElementById('phoneMinBtn').style.display = 'flex'; 
    document.getElementById('phoneAvatarUI').classList.remove('phone-pulse'); 
    
    // 如果有人接通了，但是有另外的人拒绝了，发出群聊提示
    if (rejectedMembers && rejectedMembers.length > 0) {
        let rNames = rejectedMembers.map(c => c.name).join('、');
        await saveAndRenderMsg('system', `${rNames} 拒绝了加入通话`, null, Date.now(), true);
    }
    
    // 如果群里只有部分人接听，把正在通话的名字改成这几个人
    if (acceptedMembers.length > 0) {
        document.getElementById('phoneNameUI').innerText = acceptedMembers.map(c => c.name).join(', ');
    }
    
    phoneCallTimer = setInterval(() => {
        phoneCallSeconds++;
        const mins = String(Math.floor(phoneCallSeconds / 60)).padStart(2, '0');
        const secs = String(phoneCallSeconds % 60).padStart(2, '0');
        const timeStr = `${mins}:${secs}`;
        document.getElementById('phoneStatusUI').innerText = timeStr;
        document.getElementById('minimizedTimeUI').innerText = timeStr;
    }, 1000);
}

async function endPhoneCall() {
    clearTimeout(callTimeoutObj);
    clearInterval(phoneCallTimer);
    
    // 如果这是对方打来的电话，你点击了挂断（即拒绝接听）
    if (typeof isIncomingCall !== 'undefined' && isIncomingCall) {
        isIncomingCall = false;
        document.getElementById('phoneStatusUI').innerText = 'REJECTED';
        document.getElementById('phoneAvatarUI').classList.remove('phone-pulse');
        setTimeout(() => { document.getElementById('phoneCallModal').style.display = 'none'; }, 1000);
        
        let pNames = currentCallMembers && currentCallMembers.length > 0 ? currentCallMembers.map(c => c.name).join('、') : '对方';
        await saveAndRenderMsg('system', `你拒绝了 ${pNames} 的通话请求`, null, Date.now(), true);
        return;
    }

    if (!isPhoneCallActive) {
        document.getElementById('phoneCallModal').style.display = 'none';
        await saveAndRenderMsg('system', '通话已取消', null, Date.now(), true);
        return;
    }

    isPhoneCallActive = false;
    document.getElementById('phoneStatusUI').innerText = 'CALL ENDED';
    setTimeout(() => {
        document.getElementById('phoneCallModal').style.display = 'none';
        document.getElementById('minimizedPhone').style.display = 'none';
    }, 1000);

    const mins = String(Math.floor(phoneCallSeconds / 60)).padStart(2, '0');
    const secs = String(phoneCallSeconds % 60).padStart(2, '0');
    
    let pNames = currentCallMembers && currentCallMembers.length > 0 ? currentCallMembers.map(c => c.name).join('、') : '对方';
    await saveAndRenderMsg('system', `通话结束，参与者: ${pNames}，时长: ${mins}:${secs}`, null, Date.now(), true);
}

function minimizePhoneCall() {
    document.getElementById('phoneCallModal').style.display = 'none';
    document.getElementById('minimizedPhone').style.display = 'flex';
}

function maximizePhoneCall() {
    document.getElementById('minimizedPhone').style.display = 'none';
    document.getElementById('phoneCallModal').style.display = 'flex';
}

        /* ================= 电话小窗拖拽逻辑 ================= */
        const minimizedPhone = document.getElementById('minimizedPhone');
        let isPhoneDragging = false;
        let phoneStartX, phoneStartY, phoneInitLeft, phoneInitTop;
        let phoneDragStartTime;
        let phoneMovedDistance = 0;

        minimizedPhone.addEventListener('touchstart', (e) => {
            // 获取拖拽前小窗的真实坐标
            const rect = minimizedPhone.getBoundingClientRect();
            phoneInitLeft = rect.left;
            phoneInitTop = rect.top;
            phoneStartX = e.touches[0].clientX;
            phoneStartY = e.touches[0].clientY;
            isPhoneDragging = true;
            phoneMovedDistance = 0;
            phoneDragStartTime = Date.now();
            
            // 拖拽时暂停浮动动画，防止手感抖动
            minimizedPhone.style.animation = 'none'; 
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (!isPhoneDragging) return;
            e.preventDefault(); // 防止拖拽小窗时背景页面跟着滚动
            
            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            const dx = currentX - phoneStartX;
            const dy = currentY - phoneStartY;
            phoneMovedDistance = Math.max(phoneMovedDistance, Math.abs(dx), Math.abs(dy));

            // 计算新位置
            let newLeft = phoneInitLeft + dx;
            let newTop = phoneInitTop + dy;

            // 边界保护：不让小窗被拖出屏幕外
            const maxLeft = window.innerWidth - minimizedPhone.offsetWidth;
            const maxTop = window.innerHeight - minimizedPhone.offsetHeight;
            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));

            // 抹除原本 CSS 靠右的限制，完全由 JS 的 left 和 top 接管
            minimizedPhone.style.right = 'auto';
            minimizedPhone.style.left = newLeft + 'px';
            minimizedPhone.style.top = newTop + 'px';
        }, { passive: false });

        document.addEventListener('touchend', (e) => {
            if (!isPhoneDragging) return;
            isPhoneDragging = false;
            
            // 松开手后，恢复小窗上下浮动的动画
            minimizedPhone.style.animation = 'floatBob 2.5s infinite ease-in-out';

            // 智能判断：如果手指移动距离很小（小于10px）并且很快松开，说明你是想“点击”放大它
            if (phoneMovedDistance < 10 && (Date.now() - phoneDragStartTime < 300)) {
                maximizePhoneCall();
            }
        });
        
        /* ================= 消息长按、多选与分享功能 ================= */
        const chatContainerEl = document.getElementById('chatContainer');
        const contextMenu = document.getElementById('msgContextMenu');
        let pressTimer = null;
        let currentContextMsg = null;
        let isMultiSelectMode = false;

        // 监听长按事件
        chatContainerEl.addEventListener('touchstart', (e) => {
            if (isMultiSelectMode) return;
            const msgEl = e.target.closest('.message');
            if (!msgEl) return;
            
            // 如果点的是图片，防止默认保存图片弹窗干扰
            if (e.target.tagName === 'IMG') { e.preventDefault(); }

            pressTimer = setTimeout(() => {
                currentContextMsg = msgEl;
                // 计算菜单位置，在手指点击上方出现
                const touch = e.touches[0];
                contextMenu.style.display = 'flex';
                // 限制边界防止菜单飞出屏幕
                let menuX = Math.max(60, Math.min(touch.clientX, window.innerWidth - 60));
                contextMenu.style.left = menuX + 'px';
                contextMenu.style.top = Math.max(10, touch.clientY - 55) + 'px';
            }, 600); // 600毫秒长按触发
        }, { passive: false });

        chatContainerEl.addEventListener('touchmove', () => clearTimeout(pressTimer));
        chatContainerEl.addEventListener('touchend', () => clearTimeout(pressTimer));
        
        // 点击空白处收起菜单
        document.addEventListener('touchstart', (e) => {
            if (!e.target.closest('#msgContextMenu') && !e.target.closest('.message')) {
                contextMenu.style.display = 'none';
            }
        });

        // 菜单动作分发
        // ======= 角色管理系统底层 ======= 
        function openChatSwitchModal() {
            document.getElementById('appPanel').style.display = 'none';
            document.getElementById('chatSwitchModal').style.display = 'flex';
            renderChatSwitchList();
        }
        function closeChatSwitchModal() {
            document.getElementById('chatSwitchModal').style.display = 'none';
        }
        function renderChatSwitchList() {
    const container = document.getElementById('charListContainer');
    container.innerHTML = '';
    charactersList.forEach(char => {
        const item = document.createElement('div');
        item.style.cssText = `
            display: flex; align-items: center; justify-content: space-between;
            padding: 10px; border: 3px solid var(--border-color); border-radius: 8px;
            background: var(--panel-bg);
            box-shadow: ${char.id === currentChatId ? '4px 4px 0 var(--text-color)' : '3px 3px 0 var(--border-color)'};
            transition: 0.2s;
        `;
        const radiusStyle = currentSettings.avatarShape === 'circle' ? '50%' : '6px';
        let avatarBg = char.avatarUrl ? `url(${char.avatarUrl})` : 'none';
        let charNameInit = char.name.charAt(0) || '梦';
        // 专属的独立群聊小黑框角标
        let groupTag = char.isGroup ? `<div style="position:absolute; bottom:-4px; right:-4px; background:var(--text-color); color:var(--bg-color); font-size:10px; padding:2px 4px; border-radius:4px; font-weight:900;">群</div>` : '';
        
        let avatarHtml = `<div style="position:relative; width:44px; height:44px; border:3px solid var(--border-color); border-radius:${radiusStyle}; background-image:${avatarBg}; background-size:cover; background-position:center; background-color:var(--bg-color); color:var(--text-color); display:flex; justify-content:center; align-items:center; font-weight:900; flex-shrink:0; font-size:1.2em;">${char.avatarUrl ? '' : charNameInit}${groupTag}</div>`;
        
item.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; flex:1; cursor:pointer;" onclick="switchCharacter('${char.id}')">
        ${avatarHtml}
        <div style="font-weight:900; font-size:1.1em; color:var(--text-color);">${char.name} ${char.id === currentChatId ? '<span style="color:#ff4444;font-size:0.7em;font-style:italic;margin-left:5px;">[CURRENT]</span>' : ''}</div>
    </div>
    <div style="display:flex; gap: 4px; flex-shrink:0;">
        <button class="icon-btn" style="border:none; color:var(--text-color); padding:5px; box-shadow:none; background:transparent;" onclick="openEditCharModal('${char.id}')" title="编辑">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button class="icon-btn" style="border:none; color:#ff4444; padding:5px; box-shadow:none; background:transparent;" onclick="deleteCharacter('${char.id}')" title="删除">
            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"></path></svg>
        </button>
    </div>
`;
        container.appendChild(item);
    });
}
        
        let tempNewCharAvatarData = ''; // 存放新角色头像缓存

function createNewCharacter() {
    // 清理上一次的头像缓存
    tempNewCharAvatarData = '';
    
    // 动态注入精美的新建角色弹窗
    let div = document.createElement('div');
    div.id = 'newCharModal';
    div.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:999999;display:flex;justify-content:center;align-items:center;';
    div.innerHTML = `
        <div style="background:var(--panel-bg);padding:20px 25px;border:4px solid var(--border-color);border-radius:8px;width:85%;max-width:320px;box-shadow: 6px 6px 0 var(--border-color); display:flex; flex-direction:column; gap:15px; animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
            <div style="text-align:center;font-weight:900;font-size:1.2em;font-style:italic;letter-spacing:1px;">NEW CHARACTER</div>
            
            <div style="display:flex; flex-direction:column; align-items:center; gap:8px; margin-top:5px;">
                <div id="newCharAvatarPreview" style="width:80px;height:80px;border:4px solid var(--border-color);border-radius:var(--btn-radius, 50%);background-color:var(--bg-color);display:flex;justify-content:center;align-items:center;font-weight:900;font-size:2em;color:var(--text-color);background-size:cover;background-position:center;cursor:pointer;box-shadow: 4px 4px 0 var(--border-color);transition: transform 0.1s;" onclick="document.getElementById('newCharAvatarInput').click()" onactive="this.style.transform='translate(2px,2px)'">
                    +
                </div>
                <div style="font-size:0.75em;font-weight:900;opacity:0.6;font-style:italic;">点击设置头像(可选)</div>
                <input type="file" id="newCharAvatarInput" accept="image/*" style="display:none;" onchange="handleNewCharAvatar(event)">
            </div>

            <div style="display:flex;flex-direction:column;gap:6px;">
                <label style="font-weight:900;font-size:0.85em;padding-left:2px;">角色名称</label>
                <input type="text" id="newCharNameInput" placeholder="请输入角色名字..." style="width:100%;padding:12px;border:3px solid var(--border-color);border-radius:6px;background:var(--bg-color);color:var(--text-color);font-weight:900;font-size:1em;outline:none;">
            </div>

            <div style="display:flex;gap:12px;margin-top:10px;">
                <button class="outline-btn" style="flex:1;margin:0;padding:12px;border-radius:6px;" onclick="document.getElementById('newCharModal').remove()">取消</button>
                <button class="action-btn" style="flex:1;margin:0;padding:12px;border-radius:6px;font-size:1.1em;" onclick="confirmCreateNewChar()">创建</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}

// 处理新角色的头像上传并预览
window.handleNewCharAvatar = function(e) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        tempNewCharAvatarData = event.target.result;
        const preview = document.getElementById('newCharAvatarPreview');
        preview.style.backgroundImage = `url(${tempNewCharAvatarData})`;
        preview.innerText = ''; // 隐藏加号
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // 清除文件防止选同一张图不触发
};

// 确定创建逻辑
window.confirmCreateNewChar = async function() {
    const nameInput = document.getElementById('newCharNameInput').value.trim();
    if (!nameInput) { alert('请输入角色名字！'); return; }
    
    const newChar = {
        id: 'char_' + Date.now(), 
        name: nameInput, 
        avatarUrl: tempNewCharAvatarData, 
        frameUrl: '',
        frameX: 50, frameY: 50, frameScale: 100
    };
    
    charactersList.push(newChar);
    await putToDB('settings', { key: 'charactersList', value: charactersList });
    
    tempNewCharAvatarData = ''; // 重置内存
    document.getElementById('newCharModal').remove(); // 关闭弹窗
    renderChatSwitchList(); // 刷新列表展示
};
        
        let tempEditCharAvatarData = '';
let currentEditCharId = null;

window.openEditCharModal = function(id) {
    const char = charactersList.find(c => c.id === id);
    if(!char) return;
    
    currentEditCharId = id;
    tempEditCharAvatarData = char.avatarUrl || '';
    
    let div = document.createElement('div');
    div.id = 'editCharModal';
    div.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:999999;display:flex;justify-content:center;align-items:center;';
    div.innerHTML = `
        <div style="background:var(--panel-bg);padding:20px 25px;border:4px solid var(--border-color);border-radius:8px;width:85%;max-width:320px;box-shadow: 6px 6px 0 var(--border-color); display:flex; flex-direction:column; gap:15px; animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
            <div style="text-align:center;font-weight:900;font-size:1.2em;font-style:italic;letter-spacing:1px;">EDIT PROFILE</div>
            
            <div style="display:flex; flex-direction:column; align-items:center; gap:8px; margin-top:5px;">
                <div id="editCharAvatarPreview" style="width:80px;height:80px;border:4px solid var(--border-color);border-radius:var(--btn-radius, 50%);background-color:var(--bg-color);display:flex;justify-content:center;align-items:center;font-weight:900;font-size:2em;color:var(--text-color);background-size:cover;background-position:center;cursor:pointer;box-shadow: 4px 4px 0 var(--border-color);transition: transform 0.1s; background-image:${tempEditCharAvatarData ? `url(${tempEditCharAvatarData})` : 'none'};" onclick="document.getElementById('editCharAvatarInput').click()">
                    ${tempEditCharAvatarData ? '' : '+'}
                </div>
                <div style="font-size:0.75em;font-weight:900;opacity:0.6;font-style:italic;">点击修改头像</div>
                <input type="file" id="editCharAvatarInput" accept="image/*" style="display:none;" onchange="handleEditCharAvatar(event)">
            </div>

            <div style="display:flex;flex-direction:column;gap:6px;">
                <label style="font-weight:900;font-size:0.85em;padding-left:2px;">修改名称</label>
                <input type="text" id="editCharNameInput" value="${char.name}" style="width:100%;padding:12px;border:3px solid var(--border-color);border-radius:6px;background:var(--bg-color);color:var(--text-color);font-weight:900;font-size:1em;outline:none;">
            </div>

            <div style="display:flex;gap:12px;margin-top:10px;">
                <button class="outline-btn" style="flex:1;margin:0;padding:12px;border-radius:6px;" onclick="document.getElementById('editCharModal').remove()">取消</button>
                <button class="action-btn" style="flex:1;margin:0;padding:12px;border-radius:6px;font-size:1.1em;" onclick="confirmEditChar()">保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
};

window.handleEditCharAvatar = function(e) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        tempEditCharAvatarData = event.target.result;
        const preview = document.getElementById('editCharAvatarPreview');
        preview.style.backgroundImage = `url(${tempEditCharAvatarData})`;
        preview.innerText = ''; 
    };
    reader.readAsDataURL(file);
    e.target.value = ''; 
};

window.confirmEditChar = async function() {
    const nameInput = document.getElementById('editCharNameInput').value.trim();
    if (!nameInput) { alert('名字不能为空！'); return; }
    
    // 1. 立即关闭弹窗，给用户带来“秒切”的极速手感
    document.getElementById('editCharModal').remove();
    
    const char = charactersList.find(c => c.id === currentEditCharId);
    if(char) {
        const oldName = char.name;
        const oldAvatar = char.avatarUrl;
        
        char.name = nameInput;
        char.avatarUrl = tempEditCharAvatarData;
        await putToDB('settings', { key: 'charactersList', value: charactersList });
        
        // 2. 立即更新列表UI
        renderChatSwitchList(); 
        
        // 3. 如果修改的刚好是当前房间，立即刷新顶部名称和头像
        if(currentEditCharId === currentChatId) {
            currentSettings.charName = char.name;
            currentSettings.avatarUrl = char.avatarUrl;
            document.getElementById('charNameInput').value = currentSettings.charName;
            document.getElementById('yumeTitle').innerText = currentSettings.charName;
            if (typeof updateInputDisplay === 'function') updateInputDisplay('avatarUrlInput', currentSettings.avatarUrl);
            await putToDB('settings', { key: 'config', value: currentSettings });
            if (typeof updateAvatarPreview === 'function') updateAvatarPreview();
        }
        
        // 4. 将耗时的“历史消息扫描”放到后台延迟执行，彻底解决卡顿！
        setTimeout(async () => {
            const allMsgs = await getAllFromDB('messages');
            let msgsUpdated = false;
            for (let m of allMsgs) {
                if (m.sender === 'yume' && (m.charName === oldName || m.avatarUrl === oldAvatar)) {
                    if (m.charName === oldName) m.charName = char.name;
                    if (m.avatarUrl === oldAvatar) m.avatarUrl = char.avatarUrl;
                    await putToDB('messages', m);
                    msgsUpdated = true;
                }
            }
            
            // 如果历史记录被更新了，且就在当前房间，则静默刷新一下聊天流
            if (msgsUpdated && currentEditCharId === currentChatId) {
                allMessagesCache = [];
                messageOffset = 0;
                document.getElementById('chatContainer').innerHTML = '';
                await loadMessages(true);
            }
        }, 50); // 延迟 50 毫秒，把运算让位给 UI 动画
    }
};

        async function deleteCharacter(id) {
    if (charactersList.length <= 1) { 
        showCustomConfirm('必须保留至少一个角色！', () => {}); 
        return; 
    }
    
    showCustomConfirm('确定要删除吗？\n相关的聊天记录也会被彻底清除！', async () => {
        charactersList = charactersList.filter(c => c.id !== id);
        await putToDB('settings', { key: 'charactersList', value: charactersList });
        
        const allMsgs = await getAllFromDB('messages');
        for(let m of allMsgs) {
            if(m.chatId === id || (!m.chatId && id === 'default')) await deleteFromDB('messages', m.id);
        }
        
        if (currentChatId === id) await switchCharacter(charactersList[0].id);
        else renderChatSwitchList();
    });
}
        
        async function switchCharacter(id) {
            if (currentChatId === id) return;
            currentChatId = id;
            await putToDB('settings', { key: 'currentChatId', value: currentChatId });
            
            let activeChar = charactersList.find(c => c.id === currentChatId);
            if (!activeChar) { activeChar = charactersList[0]; currentChatId = activeChar.id; }
            
            currentSettings.charName = activeChar.name; currentSettings.avatarUrl = activeChar.avatarUrl;
            currentSettings.frameUrl = activeChar.frameUrl; currentSettings.frameX = activeChar.frameX;
            currentSettings.frameY = activeChar.frameY; currentSettings.frameScale = activeChar.frameScale;
            
            document.getElementById('charNameInput').value = currentSettings.charName;
            renderHeaderLayout();
            updateInputDisplay('avatarUrlInput', currentSettings.avatarUrl);
            updateInputDisplay('frameUrlInput', currentSettings.frameUrl);
            document.getElementById('frameX').value = currentSettings.frameX;
            document.getElementById('frameY').value = currentSettings.frameY;
            document.getElementById('frameScale').value = currentSettings.frameScale;
            updateAvatarPreview();
            
            // 清空当前界面重新加载
            allMessagesCache = [];
            messageOffset = 0;
            document.getElementById('chatContainer').innerHTML = ''; 
            await loadMessages(true);
            
            renderChatSwitchList();
            closeChatSwitchModal();
        }

        // ==========================================

        async function msgAction(action) {
            contextMenu.style.display = 'none';
            if (!currentContextMsg) return;
            
            const msgId = parseInt(currentContextMsg.dataset.msgId);
            
if (action === 'reply') {
    const msg = allMessagesCache.find(m => m.id === msgId);
    if (msg) {
        let previewText = msg.text || '';
        // 拦截卡片代码，替换成干净的提示文字
        if (previewText.includes('class="checkin-chat-card"')) {
            previewText = previewText.includes('攒钱') ? '[攒钱进度分享]' : '[打卡进度分享]';
        }
        currentQuoteData = {
            id: msg.id, sender: msg.sender, text: previewText, imgUrl: msg.imgUrl,
            name: msg.sender === 'user' ? (currentSettings.userName || '我') : (msg.charName || currentSettings.charName || 'TA')
        };
        showInputQuotePreview();
    }
    return;
}

            if (action === 'copy') {
                const bubble = currentContextMsg.querySelector('.bubble');
                if (bubble && bubble.innerText) {
                    const copyFallback = (text) => {
                        const textArea = document.createElement("textarea");
                        textArea.value = text;
                        textArea.style.position = "fixed"; textArea.style.top = "0"; textArea.style.left = "0"; textArea.style.opacity = "0";
                        document.body.appendChild(textArea);
                        textArea.focus(); textArea.select();
                        try {
                            if (document.execCommand('copy')) alert('已复制到剪贴板！');
                            else alert('复制失败，请手动选择。');
                        } catch (err) { alert('复制失败，请手动选择。'); }
                        document.body.removeChild(textArea);
                    };
                    // 兼容手机本地运行的无敌暴力强行复制
                    if (navigator.clipboard && window.isSecureContext) {
                        navigator.clipboard.writeText(bubble.innerText).then(() => alert('已复制到剪贴板！')).catch(() => copyFallback(bubble.innerText));
                    } else {
                        copyFallback(bubble.innerText);
                    }
                } else { alert('该消息没有可复制的文本。'); }
            } 
            
            else if (action === 'interpret') {
    if (currentSettings.apiEnabled !== "true") {
        showCustomConfirm("请先在左下角侧边栏的【API设置】中开启并配置好接口！", () => {});
        return;
    }
    const bubble = currentContextMsg.querySelector('.bubble');
    if (bubble && bubble.textContent) {
        const clone = bubble.cloneNode(true);
        const quoteBox = clone.querySelector('.quote-box');
        if (quoteBox) quoteBox.remove();
        const transBox = clone.querySelector('.ai-translate-box');
        if (transBox) transBox.remove();
        
        const txt = clone.textContent.trim().replace(/[\n\r]/g, ' ');
        if (txt) {
            doAiInterpret(txt, bubble);
        } else {
            showCustomConfirm("这条消息没有提取到文字哦！", () => {});
        }
    } else { 
        showCustomConfirm("只能解读文字消息哦！", () => {}); 
    }
}

                        else if (action === 'star') {
                const msgId = parseInt(currentContextMsg.dataset.msgId);
                getFromDB('messages', msgId).then(async (msg) => {
                    if (msg) {
                        msg.isStarred = true;
                        msg.starTimestamp = Date.now();
                        await putToDB('messages', msg);
                        // 自定义无感轻提示，避免丑陋的系统弹窗
                        let t = document.createElement('div');
                        t.style.cssText = 'position:fixed; bottom:120px; left:50%; transform:translateX(-50%); background:var(--text-color); color:var(--bg-color); padding:8px 16px; border-radius:20px; font-weight:900; font-size:0.9em; z-index:999999; opacity:0; transition:opacity 0.3s; pointer-events:none; box-shadow:0 4px 10px rgba(0,0,0,0.2);';
                        t.innerText = '已加入收藏夹';
                        document.body.appendChild(t);
                        setTimeout(()=>t.style.opacity='1', 10);
                        setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 1500);
                    }
                });
            }
            else if (action === 'delete') {
                showCustomConfirm('确定要删除这条消息吗？', async () => {
                    await deleteFromDB('messages', msgId);
                    currentContextMsg.remove(); // 界面上移除
                    // 同步缓存
                    allMessagesCache = allMessagesCache.filter(m => m.id !== msgId);
                });
            } 
            else if (action === 'multiselect') {
                enterMultiSelectMode();
            }
        }

// 进入多选模式
        function enterMultiSelectMode() {
            isMultiSelectMode = true;
            document.body.classList.add('multi-select-mode');
            document.querySelector('.input-wrapper').style.display = 'none';
            document.getElementById('multiSelectBar').classList.add('active');
            
            // 🌟关键修复：给聊天容器底部加个超大内边距，防止最后一条被底栏挡住
            document.getElementById('chatContainer').style.paddingBottom = '100px'; 
            
            // 自动把刚才长按的那条消息打上勾
            if (currentContextMsg) {
                const cb = currentContextMsg.querySelector('.msg-checkbox');
                if (cb) cb.checked = true;
            }
            
            // 自动往下滑一点，确保最后一条消息完全露出来
            setTimeout(() => scrollToBottom(false), 50);
        }

        // 退出多选模式
        function quitMultiSelect() {
            isMultiSelectMode = false;
            document.body.classList.remove('multi-select-mode');
            document.querySelector('.input-wrapper').style.display = 'flex';
            document.getElementById('multiSelectBar').classList.remove('active');
            
            // 🌟恢复聊天容器原本的内边距
            document.getElementById('chatContainer').style.paddingBottom = '10px';
            
            // 取消所有勾选
            document.querySelectorAll('.msg-checkbox').forEach(cb => cb.checked = false);
        }

// 生成纯净且精美的排版模式（供用户系统截图）
        function shareSelectedMessages() {
            const selected = document.querySelectorAll('.msg-checkbox:checked');
            if (selected.length === 0) { alert('请先选择要分享的消息！'); return; }

            // 获取当前时间戳作为卡片底部的水印时间
            const now = new Date();
            const timeString = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

            // 1. 创建全屏半透明遮罩背景
            const renderBox = document.createElement('div');
            renderBox.id = 'screenshotUI';
            renderBox.style.cssText = `
                position: fixed; inset: 0; z-index: 999999;
                background-color: var(--bg-color); background-image: var(--bg-pattern); background-size: var(--bg-size);
                display: flex; flex-direction: column; align-items: center; overflow-y: auto; 
                padding: 40px 15px 120px 15px; font-size: ${currentSettings.globalFontSize || 14}px; color: var(--text-color);
            `;

            // 2. 创建一个类似手账卡片的精美容器（去除阴影扁平化）
            const cardContainer = document.createElement('div');
            cardContainer.style.cssText = `
                width: 100%; max-width: 500px; background: var(--panel-bg);
                border: 4px solid var(--border-color); border-radius: 16px;
                display: flex; flex-direction: column;
                overflow: hidden; position: relative;
            `;

            // 3. 卡片顶部黑底白字 Header
            const headerInfo = document.createElement('div');
            headerInfo.style.cssText = `
                background: var(--text-color); color: var(--bg-color);
                padding: 15px; text-align: center; position: relative; border-bottom: 4px solid var(--border-color);
            `;
            headerInfo.innerHTML = `
                <div style="font-weight: 900; font-size: 1.3em; font-style: italic; letter-spacing: 2px;">YUME.OS RECORD</div>
                <div style="font-weight: bold; font-size: 0.85em; opacity: 0.9; margin-top: 4px;">
                    ${currentSettings.charName} <span style="margin:0 5px;">×</span> ${currentSettings.userName}
                </div>
            `;
            cardContainer.appendChild(headerInfo);

            // 4. 卡片中间的消息容纳区
            const msgContainer = document.createElement('div');
            msgContainer.style.cssText = 'display: flex; flex-direction: column; gap: 16px; padding: 25px 15px; background: var(--bg-color);';
            
            selected.forEach(cb => {
                const msgNode = cb.closest('.message').cloneNode(true);
                const check = msgNode.querySelector('.msg-checkbox');
                if(check) check.remove(); // 截图里不需要复选框
                msgNode.style.pointerEvents = 'none'; // 截图模式防误触
                
                // 确保气泡左右对齐
                if (msgNode.classList.contains('yume')) { msgNode.style.alignSelf = 'flex-start'; }
                if (msgNode.classList.contains('user')) { msgNode.style.alignSelf = 'flex-end'; }
                
                msgContainer.appendChild(msgNode);
            });
            cardContainer.appendChild(msgContainer);

            // 5. 卡片底部虚线水印 Footer
            const footerInfo = document.createElement('div');
            footerInfo.style.cssText = `
                border-top: 3px dashed var(--border-color); padding: 12px 15px;
                display: flex; justify-content: space-between; align-items: center;
                background: var(--panel-bg); font-weight: 900; font-size: 0.75em; opacity: 0.8;
            `;
            footerInfo.innerHTML = `
                <span>GENERATED BY YUME.OS</span>
                <span>${timeString}</span>
            `;
            cardContainer.appendChild(footerInfo);

            // 将整张卡片放入页面
            renderBox.appendChild(cardContainer);

            // 6. 底部悬浮的提示与退出按钮（精致红色小圆叉）
            const bottomBar = document.createElement('div');
            bottomBar.style.cssText = `
                position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
                display: flex; flex-direction: column; align-items: center; gap: 8px; z-index: 1000000;
            `;
            bottomBar.innerHTML = `
                <div style="background: var(--text-color); color: var(--bg-color); padding: 6px 15px; border-radius: 20px; font-weight: 900; font-size: 0.85em; box-shadow: 0 4px 10px rgba(0,0,0,0.2);">
                    请使用自带截屏
                </div>
                <button class="top-btn" style="width: 50px; height: 50px; border-radius: 50%; background: #ff4444; color: #fff; border: 4px solid var(--border-color); box-shadow: 4px 4px 0 var(--border-color); margin-top: 5px; display:flex; justify-content:center; align-items:center;" onclick="document.getElementById('screenshotUI').remove(); quitMultiSelect();">
                    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            `;
            renderBox.appendChild(bottomBar);

            document.body.appendChild(renderBox);
        }
        
        // 删除选中的多条消息
        function deleteSelectedMessages() {
            const selected = document.querySelectorAll('.msg-checkbox:checked');
            if (selected.length === 0) { alert('请先选择消息！'); return; }
            
            showCustomConfirm(`确定要删除选中的 ${selected.length} 条消息吗？`, async () => {
                for (let cb of selected) {
                    const msgEl = cb.closest('.message');
                    const msgId = parseInt(msgEl.dataset.msgId);
                    await deleteFromDB('messages', msgId);
                    allMessagesCache = allMessagesCache.filter(m => m.id !== msgId);
                    msgEl.remove();
                }
                quitMultiSelect();
            });
        }
        
        // 按记录的顺序复制选中的多条消息文本
function copySelectedMessages() {
    // querySelectorAll 获取到的元素自带从上到下的 DOM 顺序，所以天生就是按时间顺序排列的！
    const selected = document.querySelectorAll('.msg-checkbox:checked');
    if (selected.length === 0) { alert('请先选择要复制的消息！'); return; }

    let copyText = "";

    selected.forEach(cb => {
        const msgEl = cb.closest('.message');
        const msgId = parseInt(msgEl.dataset.msgId);
        // 直接去内存数据库里捞干净的数据，避免解析出乱七八糟的 HTML
        const msgData = allMessagesCache.find(m => m.id === msgId);

        if (msgData) {
            // 智能判定名字（适配了群聊和单聊）
            let senderName = msgData.sender === 'user' 
                ? (currentSettings.userName || '我') 
                : (msgData.charName || currentSettings.charName || 'TA');
            
            let content = msgData.text || '';
            
            // 拦截分享卡片和图片，转成干净的文字
            if (content.includes('class="checkin-chat-card"')) {
                content = content.includes('攒钱') ? '[攒钱记录]' : '[打卡记录/催更]';
            } else if (content.includes('class="red-packet-card"')) {
                content = '[红包]';
            } else if (content.includes('class="music-chat-card"')) {
                content = '[分享了一首音乐]';
            } else if (content.includes('class="sudden-thought-card"')) {
                content = '[随机念头小卡片]';
            } else if (msgData.imgUrl) {
                content = '[图片/表情包]';
            } else {
                // 如果是纯文本，清除掉可能存在的 HTML 标签（比如加粗、颜色代码等）
                content = content.replace(/<[^>]+>/g, '').trim(); 
            }

            // 拼接格式： 名字：内容 
            copyText += `${senderName}：${content}\n`;
        }
    });

    // 调取系统的剪贴板复制功能
    const textArea = document.createElement("textarea");
    textArea.value = copyText.trim();
    textArea.style.position = "fixed"; textArea.style.top = "0"; textArea.style.left = "0"; textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus(); textArea.select();
    try {
        if (document.execCommand('copy')) {
            alert('已按聊天顺序复制到剪贴板！');
            quitMultiSelect(); // 复制完自动退出多选模式
        } else {
            alert('复制失败，请重试。');
        }
    } catch (err) { 
        alert('复制失败，请重试。'); 
    }
    document.body.removeChild(textArea);
}

                /* ================= 收藏夹与数据统计系统 (日月年+折叠大改版) ================= */
        let currentStarTab = 'day';

        async function openStarModal() {
    document.getElementById('appPanel').style.display = 'none';
    // 拦截！如果没开数据统计，点击无效并提示
    if (currentSettings.enableStats === "false") {
        showCustomConfirm('数据统计与收藏功能已在设置中关闭，无法查看数据面板。', () => {});
        return;
    }
    document.getElementById('starModal').style.display = 'flex';
    // 弹出后在后台静默更新一次确保最新
    renderStarList(currentStarTab);
}

        function closeStarModal() {
            document.getElementById('starModal').style.display = 'none';
        }

        function switchStarTab(mode) {
            currentStarTab = mode;
            document.getElementById('starTabDay').classList.remove('active');
            document.getElementById('starTabMonth').classList.remove('active');
            document.getElementById('starTabYear').classList.remove('active');
            
            if(mode === 'day') document.getElementById('starTabDay').classList.add('active');
            if(mode === 'month') document.getElementById('starTabMonth').classList.add('active');
            if(mode === 'year') document.getElementById('starTabYear').classList.add('active');
            
            renderStarList(mode);
        }

        // 头部点击折叠展开功能
        function toggleStatsCollapse(contentId, headerEl) {
            const content = document.getElementById(contentId);
            const icon = headerEl.querySelector('svg');
            if (content.style.display === 'none') {
                content.style.display = 'flex';
                icon.style.transform = 'rotate(0deg)';
                headerEl.style.borderBottom = '3px dashed var(--border-color)';
            } else {
                content.style.display = 'none';
                icon.style.transform = 'rotate(-90deg)';
                headerEl.style.borderBottom = 'none';
            }
        }

const STOP_WORDS = new Set([
    '的','了','是','我','你','他','她','它','们','这','那','有','在','就','也','都',
    '和','与','或','但','不','没','很','太','更','最','已','被','让','把','对','从',
    '到','于','以','为','之','其','而','则','所','等','啊','哦','嗯','哈','呢','吧',
    '吗','嘛','呀','哇','哎','唉','嗯嗯','哈哈','嘻嘻','呵呵','哦哦','啊啊','哈哈哈',
    '一','二','三','四','五','六','七','八','九','十','个','次','条','件','种',
    '好','行','可以','可','又','再','还','来','去','说','想','知道','觉得','感觉',
    '什么','怎么','为什么','哪','谁','哪里','怎样','如何','这么','那么',
    '然后','因为','所以','如果','虽然','但是','而且','不过','只是','只有',
    '没有','不是','还是','就是','真的','对啊','好的','好吧','那个','这个',
    '今天','昨天','明天','现在','以前','以后','时候','时间','一下','一直','一个',
    'ok','OK','Ok','yes','no','hh','hhhh','hhh','嗯','额',
    '图片','表情','语音','已撤回'
]);

        async function renderStarList(mode = 'day') {
            const container = document.getElementById('starListContainer');
            
            const allMsgs = await getAllFromDB('messages');
            // 只获取当前所处角色的聊天记录
            const charMsgs = allMsgs.filter(m => (!m.chatId && currentChatId === 'default') || m.chatId === currentChatId);
            
            const timeGroups = {};
            charMsgs.forEach(m => {
                const d = new Date(m.timestamp);
                let dateKey = '';
                // 根据模式切割时间格式
                if (mode === 'day') {
                    dateKey = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
                } else if (mode === 'month') {
                    dateKey = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}`;
                } else if (mode === 'year') {
                    dateKey = `${d.getFullYear()}`;
                }

                if (!timeGroups[dateKey]) {
                    timeGroups[dateKey] = {
                        dateStr: dateKey, myCount: 0, taCount: 0, taTexts: {}, starredMsgs: [],
                        callCount: 0, callTotalSeconds: 0
                    };
                }
                
                // 1. 统计通话记录（从系统提示中解析时长和次数）
                if (m.sender === 'system' && m.text && m.text.includes('通话结束') && m.text.includes('时长:')) {
                    timeGroups[dateKey].callCount++;
                    const match = m.text.match(/时长:\s*(\d{2}):(\d{2})/);
                    if (match) {
                        timeGroups[dateKey].callTotalSeconds += parseInt(match[1]) * 60 + parseInt(match[2]);
                    }
                }

// 2. 统计发言与字卡
if (m.sender === 'user') {
    timeGroups[dateKey].myCount++;
} else if (m.sender === 'yume') {
    timeGroups[dateKey].taCount++;
    
    let cleanText = m.text || '';
    if (cleanText) {
        // 1. 基础清洗：防止系统代码泄露
        if (cleanText.includes('class="checkin-chat-card"') || 
            cleanText.includes('class="red-packet-card"') || 
            cleanText.includes('class="music-chat-card"') || 
            cleanText.includes('class="sudden-thought-card"')) {
            cleanText = ''; 
        } else {
            // 过滤 HTML 标签
            cleanText = cleanText.replace(/<[^>]+>/g, '').trim(); 
            // 暴力去除所有标点符号、空格，只保留中文、字母、数字
            cleanText = cleanText.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
        }

        // 2. 精准分词+过滤废话
        let cn = cleanText.replace(/[a-zA-Z0-9 ]/g, ''); // 提取纯中文
        let covered = new Array(cn.length).fill(false);
        // 先找 4 字词
        for (let i = 0; i + 4 <= cn.length; i++) {
            let w4 = cn.slice(i, i + 4);
            if (!STOP_WORDS.has(w4)) {
                timeGroups[dateKey].taTexts[w4] = (timeGroups[dateKey].taTexts[w4] || 0) + 1;
                covered[i] = covered[i+1] = covered[i+2] = covered[i+3] = true;
                i += 3; // 跳过已覆盖的字
            }
        }
        // 再找 3 字词
        covered = new Array(cn.length).fill(false);
        for (let j = 0; j + 3 <= cn.length; j++) {
            let w3 = cn.slice(j, j + 3);
            if (!STOP_WORDS.has(w3)) {
                timeGroups[dateKey].taTexts[w3] = (timeGroups[dateKey].taTexts[w3] || 0) + 1;
                j += 2;
            }
        }
        // 再找 2 字词
        for (let k = 0; k + 2 <= cn.length; k += 2) {
            let w2 = cn.slice(k, k + 2);
            if (!STOP_WORDS.has(w2)) {
                timeGroups[dateKey].taTexts[w2] = (timeGroups[dateKey].taTexts[w2] || 0) + 1;
            }
        }
        // 统计英文单词 (3个字母以上)
        let enWords = cleanText.match(/[a-zA-Z]{3,}/g) || [];
        enWords.forEach(w => {
            let lw = w.toLowerCase();
            if (!STOP_WORDS.has(lw)) {
                timeGroups[dateKey].taTexts[lw] = (timeGroups[dateKey].taTexts[lw] || 0) + 1;
            }
        });
    }
}
                
                // 3. 筛选出被收藏的
                if (m.isStarred) {
                    timeGroups[dateKey].starredMsgs.push(m);
                }
            });

            // 日期按最新到最旧排列
            const sortedDates = Object.keys(timeGroups).sort((a, b) => new Date(b.replace(/\./g, '/')).getTime() - new Date(a.replace(/\./g, '/')).getTime());
            
            let htmlBuffer = '';
            let hasData = false;

            sortedDates.forEach((dateStr, index) => {
                const group = timeGroups[dateStr];
                
                // 核心修改：只要有聊天记录，或者有打电话，或者有收藏，就显示，哪怕收藏是0！
                if (group.myCount === 0 && group.taCount === 0 && group.callCount === 0 && group.starredMsgs.length === 0) return; 
                hasData = true;

                const totalCount = group.myCount + group.taCount;
                
// 计算高频字卡 Top 5
let sortedTexts = Object.keys(group.taTexts).map(text => {
    return { text: text, count: group.taTexts[text] };
}).sort((a, b) => b.count - a.count);

let topCardsHtml = "";
if (sortedTexts.length === 0) {
    topCardsHtml = `<span style="background: var(--text-color); color: var(--bg-color); padding: 4px 8px; border-radius: 4px; font-style: italic; align-self: flex-start;">无文本记录</span>`;
} else {
    let limit = Math.min(10, sortedTexts.length);
    for (let i = 0; i < limit; i++) {
        topCardsHtml += `<div style="background: var(--text-color); color: var(--bg-color); padding: 4px 8px; border-radius: 4px; font-style: italic; align-self: flex-start; word-break: break-all; font-size: 0.9em; margin-bottom: 2px;">
            Top ${i+1}: ${sortedTexts[i].text} <span style="opacity:0.8; font-size:0.8em; margin-left:4px;">(${sortedTexts[i].count}次)</span>
        </div>`;
    }
}
                
                // 计算电话总时长格式
                let callTimeHtml = '';
                if (group.callCount > 0) {
                    const cMins = String(Math.floor(group.callTotalSeconds / 60)).padStart(2, '0');
                    const cSecs = String(group.callTotalSeconds % 60).padStart(2, '0');
                    callTimeHtml = `<div style="width: 100%; border-top:2px dashed var(--border-color); padding-top:4px; margin-top:2px;">通话: ${group.callCount} 次  |  总时长: ${cMins}:${cSecs}</div>`;
                }

const headerId = `stats-content-${dateStr.replace(/\./g, '-')}`;
// 默认全部折叠，不展开任何一个
const isCollapsed = true;
const displayStyle = isCollapsed ? 'none' : 'flex';
                const rotation = isCollapsed ? '-90deg' : '0deg';
                const borderBottom = isCollapsed ? 'none' : '3px dashed var(--border-color)';

                htmlBuffer += `
    <div style="background:var(--panel-bg); border:4px solid var(--border-color); border-radius:12px; margin-bottom:15px; box-shadow: 4px 4px 0 var(--border-color); overflow:hidden; flex-shrink: 0;">
                        
                        <!-- 可点击的折叠头部 -->
                        <div style="font-weight:900; font-size:1.15em; font-style:italic; border-bottom:${borderBottom}; padding:15px; display:flex; justify-content:space-between; align-items:center; letter-spacing: 1px; cursor:pointer; user-select:none;" onclick="toggleStatsCollapse('${headerId}', this)">
                            <div style="display:flex; align-items:baseline; gap:8px;">
                                <span>${dateStr}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:8px; opacity:0.8; font-size:0.7em;">
                                <span>[记录:${totalCount} / 收藏:${group.starredMsgs.length}]</span>
                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s ease; transform: rotate(${rotation});"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </div>
                        </div>
                        
                        <!-- 展开的内容区 -->
                        <div id="${headerId}" style="padding: 15px; display: ${displayStyle}; flex-direction: column; background:var(--bg-color);">
                            
                            <div style="font-size:0.85em; font-weight:900; display:flex; flex-wrap:wrap; gap:6px; margin-bottom:15px; background:var(--panel-bg); padding:10px; border-radius:6px; border:3px solid var(--border-color);">
                                <div style="width: 48%;">我发送: ${group.myCount} 条</div>
                                <div style="width: 48%;">TA发送: ${group.taCount} 条</div>
                                <div style="width: 100%; border-top:2px solid var(--border-color); padding-top:4px;">期间共计: ${totalCount} 条记录</div>
<div style="width: 100%; margin-top:2px; display: flex; flex-direction: column; gap: 4px;">
    <span style="margin-bottom: 2px; font-weight: 900;">TA高频词 Top10:</span>
    ${topCardsHtml}
</div>
${callTimeHtml}
                            </div>
                            
                            <div style="display:flex; flex-direction:column; gap:12px;">
                `;

                // 渲染收藏气泡
                if (group.starredMsgs.length === 0) {
                    htmlBuffer += `<div style="text-align:center; opacity:0.5; font-weight:900; font-style:italic; font-size: 0.85em; padding: 10px 0;">该周期暂无收藏的消息</div>`;
                } else {
                    group.starredMsgs.forEach(sm => {
                        // 在月和年视图下，时间戳加上具体的日期以防弄混
                        const timeStr = mode === 'day' ? formatTime(sm.timestamp) : `${formatDate(sm.timestamp).substring(5)} ${formatTime(sm.timestamp)}`;
                        let contentHtml = sm.text ? sm.text : `<img src="${sm.imgUrl}" style="max-height:80px; border:3px solid var(--border-color); border-radius:4px;" />`;
                        let senderName = sm.sender === 'user' ? (currentSettings.userName || '我') : (sm.charName || currentSettings.charName || 'TA');
                        let align = sm.sender === 'user' ? 'flex-end' : 'flex-start';
                        let bg = sm.sender === 'user' ? 'var(--panel-bg)' : 'var(--bubble-bg)';
                        
                        htmlBuffer += `
                            <div style="align-self:${align}; max-width:90%; background:${bg}; border:3px solid var(--border-color); padding:8px 12px; border-radius:8px; font-weight:900; font-size:1em; position:relative; word-break: break-all;">
                                <div style="font-size:0.7em; opacity:0.6; margin-bottom:4px; font-style:italic;">${senderName} • ${timeStr}</div>
                                <div>${contentHtml}</div>
                                <button onclick="unstarMessage(${sm.id})" style="position:absolute; top:-10px; right:-10px; background:#ff4444; color:#fff; border:3px solid var(--border-color); border-radius:50%; width:24px; height:24px; font-size:12px; font-weight:bold; cursor:pointer; display:flex; justify-content:center; align-items:center; z-index:2; padding-bottom:2px;">x</button>
                            </div>
                        `;
                    });
                }

                htmlBuffer += `</div></div></div>`;
            });

            if (!hasData) {
                container.innerHTML = '<div style="text-align:center; opacity:0.5; font-weight:900; padding:40px 0; font-style:italic;">该角色暂无任何数据记录...</div>';
            } else {
                container.innerHTML = htmlBuffer;
            }
        }

        async function unstarMessage(id) {
            showCustomConfirm('确定要取消收藏该消息吗？', async () => {
                const msg = await getFromDB('messages', id);
                if (msg) {
                    msg.isStarred = false;
                    await putToDB('messages', msg);
                    await renderStarList(currentStarTab); // 取消后自动原地刷新列表
                }
            });
        }
        
        /* ================= 打卡系统底层逻辑 ================= */
let checkinDataList = [];

async function openCheckinModal() {
    document.getElementById('appPanel').style.display = 'none';
    
    // 1. 先读数据
    const data = await getFromDB('settings', 'checkinData');
    checkinDataList = data ? data.value : [];
    
    // 2. 显示弹窗并瞬间排版
    document.getElementById('checkinModal').style.display = 'flex';
    renderCheckinList();
}

function renderCheckinList() {
    const container = document.getElementById('checkinListRender');
    container.innerHTML = '';
    if (checkinDataList.length === 0) {
        container.innerHTML = '<div style="text-align:center; opacity:0.5; font-weight:900; padding:40px 0; font-style:italic;">还没有建立过打卡目标哦~</div>';
        return;
    }
    
    const sortedList = [...checkinDataList].reverse();
    const todayStr = new Date().toLocaleDateString();

    sortedList.forEach(ci => {
        const isCompleted = ci.checkedDates.length >= ci.targetDays;
        const hasCheckedToday = ci.checkedDates.includes(todayStr);
        const progressPct = Math.min(100, Math.round((ci.checkedDates.length / ci.targetDays) * 100));
        if(!ci.partnerCheckedDates) ci.partnerCheckedDates = [];
        
        let badgeHtml = isCompleted ? '<span class="checkin-badge">达成</span>' : `<span class="checkin-badge">${ci.mode === 'duo' ? '双人羁绊' : '个人目标'}</span>`;
        
        let uAvatar = currentSettings.userAvatarUrl ? `background-image:url(${currentSettings.userAvatarUrl});color:transparent;` : '';
        let uChar = currentSettings.userAvatarUrl ? '' : (currentSettings.userName.charAt(0) || '我');
        let avatarsHtml = `<div class="checkin-avatar" style="${uAvatar}">${uChar}</div>`;
        
        let pName = 'TA';
        if (ci.mode === 'duo') {
            const partner = charactersList.find(c => c.id === ci.partnerId);
            pName = partner ? partner.name : 'TA';
            let pAvatar = partner && partner.avatarUrl ? `background-image:url(${partner.avatarUrl});color:transparent;` : '';
            let pChar = partner && partner.avatarUrl ? '' : (partner ? partner.name.charAt(0) : '梦');
            avatarsHtml += `<div class="checkin-avatar overlap" style="${pAvatar}">${pChar}</div>`;
        }

        let pProgressHtml = '';
        if (ci.mode === 'duo' && ci.partnerCheckEnabled) {
            const pPct = Math.min(100, Math.round((ci.partnerCheckedDates.length / ci.targetDays) * 100));
            pProgressHtml = `
                <div class="checkin-progress-text" style="margin-top:6px;">${pName}的进度: ${ci.partnerCheckedDates.length} / ${ci.targetDays} 天</div>
                <div class="checkin-progress-bar" style="margin-bottom:0;">
                    <div class="checkin-progress-fill" style="width: ${pPct}%; background:var(--border-color);"></div>
                </div>
            `;
        }

        let checkBtnHtml = '';
        if (isCompleted) {
            checkBtnHtml = `<button class="action-btn" style="flex:1; padding:8px; border-radius:6px; opacity:0.5; cursor:not-allowed;">目标达成</button>`;
        } else if (hasCheckedToday) {
            checkBtnHtml = `<button class="outline-btn" style="flex:1; padding:8px; border-radius:6px; opacity:0.7; margin:0;" onclick="showCustomConfirm('今天已经打过卡啦，明天继续哦！', ()=>{})">今日已打卡</button>`;
        } else {
            checkBtnHtml = `<button class="action-btn" style="flex:1; padding:8px; border-radius:6px; margin:0;" onclick="doCheckin('${ci.id}')">立刻打卡</button>`;
        }

        const itemHtml = `
            <div class="checkin-item">
                <div class="checkin-header">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div class="checkin-title">${ci.title}</div>
                        ${badgeHtml}
                    </div>
                    <button onclick="deleteCheckin('${ci.id}')" style="background:transparent; border:none; color:#ff4444; font-weight:900; font-size:1.2em; cursor:pointer; padding:0; line-height:1;">✖</button>
                </div>
                <div class="checkin-avatars">${avatarsHtml}</div>
                
                <div class="checkin-progress-text">我的进度: ${ci.checkedDates.length} / ${ci.targetDays} 天</div>
                <div class="checkin-progress-bar">
                    <div class="checkin-progress-fill" style="width: ${progressPct}%;"></div>
                </div>
                ${pProgressHtml}
                
                <div class="checkin-actions">
                    ${checkBtnHtml}
                    <button class="outline-btn" style="flex:1; padding:8px; border-radius:6px; margin:0; border-style:dashed;" onclick="shareCheckin('${ci.id}', 'user')">分享至聊天</button>
                </div>
            </div>
        `;
        container.innerHTML += itemHtml;
    });
}

function toggleCustomDays() {
    const sel = document.getElementById('ciDaysSelect');
    const customInput = document.getElementById('ciCustomDaysInput');
    customInput.style.display = (sel.value === 'custom') ? 'block' : 'none';
}

function toggleDuoSelect() {
    const mode = document.getElementById('ciModeSelect').value;
    const partnerGroup = document.getElementById('ciPartnerGroup');
    if (mode === 'duo') {
        partnerGroup.style.display = 'block';
        const partnerSel = document.getElementById('ciPartnerSelect');
        // 将不是群聊的单人角色加入下拉菜单
        partnerSel.innerHTML = charactersList.filter(c => !c.isGroup).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    } else {
        partnerGroup.style.display = 'none';
    }
}

function openCreateCheckinModal() {
    document.getElementById('ciNameInput').value = '';
    document.getElementById('ciDaysSelect').value = '7';
    toggleCustomDays();
    document.getElementById('ciModeSelect').value = 'single';
    toggleDuoSelect();
    document.getElementById('createCheckinModal').style.display = 'flex';
}

async function saveNewCheckin() {
    const title = document.getElementById('ciNameInput').value.trim();
    if (!title) { showCustomConfirm('请输入打卡目标名称！', ()=>{}); return; }
    
    let daysVal = document.getElementById('ciDaysSelect').value;
    let targetDays = 0;
    if (daysVal === 'custom') {
        targetDays = parseInt(document.getElementById('ciCustomDaysInput').value);
        if (!targetDays || targetDays <= 0) { showCustomConfirm('请输入有效的天数！', ()=>{}); return; }
    } else {
        targetDays = parseInt(daysVal);
    }

    const mode = document.getElementById('ciModeSelect').value;
    const partnerId = mode === 'duo' ? document.getElementById('ciPartnerSelect').value : null;
    const partnerCheckEnabled = mode === 'duo' ? document.getElementById('ciPartnerCheckToggle').checked : false;

    const newCi = {
        id: 'ci_' + Date.now(),
        title: title,
        targetDays: targetDays,
        mode: mode,
        partnerId: partnerId,
        partnerCheckEnabled: partnerCheckEnabled,
        checkedDates: [],
        partnerCheckedDates: [], // 梦角的打卡记录
        nextPartnerCheckinTime: 0 // 记录梦角的下一次随机打卡时间
    };

    checkinDataList.push(newCi);
    await putToDB('settings', { key: 'checkinData', value: checkinDataList });
    document.getElementById('createCheckinModal').style.display = 'none';
    renderCheckinList();
}

async function doCheckin(id) {
    const ci = checkinDataList.find(c => c.id === id);
    if(!ci) return;
    const todayStr = new Date().toLocaleDateString();
    if (!ci.checkedDates.includes(todayStr)) {
        ci.checkedDates.push(todayStr);
        await putToDB('settings', { key: 'checkinData', value: checkinDataList });
        renderCheckinList();
        
        // 打卡成功悬浮轻提示
        let t = document.createElement('div');
        t.style.cssText = 'position:fixed; bottom:120px; left:50%; transform:translateX(-50%); background:var(--text-color); color:var(--bg-color); padding:8px 16px; border-radius:20px; font-weight:900; font-size:0.9em; z-index:999999; opacity:0; transition:opacity 0.3s; pointer-events:none; box-shadow:0 4px 10px rgba(0,0,0,0.2);';
        t.innerText = '打卡成功！';
        document.body.appendChild(t);
        setTimeout(()=>t.style.opacity='1', 10);
        setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 1500);
    }
}

async function deleteCheckin(id) {
    showCustomConfirm('确定要删除这个打卡目标吗？', async () => {
        checkinDataList = checkinDataList.filter(c => c.id !== id);
        await putToDB('settings', { key: 'checkinData', value: checkinDataList });
        renderCheckinList();
    });
}

// 核心：分享生成特殊消息气泡
async function shareCheckin(id, sender = 'user') {
    const ci = checkinDataList.find(c => c.id === id);
    if(!ci) return;
    
    if (sender === 'user') {
        document.getElementById('checkinModal').style.display = 'none';
    }

    if(!ci.partnerCheckedDates) ci.partnerCheckedDates = [];
    const isCompleted = ci.checkedDates.length >= ci.targetDays;
    const progressPct = Math.min(100, Math.round((ci.checkedDates.length / ci.targetDays) * 100));
    
    let uAvatar = currentSettings.userAvatarUrl ? `background-image:url(${currentSettings.userAvatarUrl});color:transparent;` : '';
    let uChar = currentSettings.userAvatarUrl ? '' : (currentSettings.userName.charAt(0) || '我');
    let avatarsHtml = `<div class="checkin-avatar" style="${uAvatar}">${uChar}</div>`;
    
    let pName = 'TA';
    if (ci.mode === 'duo') {
        const partner = charactersList.find(c => c.id === ci.partnerId);
        pName = partner ? partner.name : 'TA';
        let pAvatar = partner && partner.avatarUrl ? `background-image:url(${partner.avatarUrl});color:transparent;` : '';
        let pChar = partner && partner.avatarUrl ? '' : (partner ? partner.name.charAt(0) : '梦');
        avatarsHtml += `<div class="checkin-avatar overlap" style="${pAvatar}">${pChar}</div>`;
    }

    let statusText = isCompleted ? '目标达成，恭喜！' : '正在努力坚持中...';
    if (sender === 'char') {
        statusText = (ci.partnerCheckedDates.length >= ci.targetDays) ? '目标达成，恭喜！' : '打卡啦，我们一起努力！';
    }
    
    let pProgressHtml = '';
    if (ci.mode === 'duo' && ci.partnerCheckEnabled) {
        const pPct = Math.min(100, Math.round((ci.partnerCheckedDates.length / ci.targetDays) * 100));
        pProgressHtml = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                <div style="font-size:0.8em; font-weight:900; font-style:italic;">${pName}</div>
                <div class="checkin-progress-text">${ci.partnerCheckedDates.length} / ${ci.targetDays} 天</div>
            </div>
            <div class="checkin-progress-bar" style="margin-bottom:0; height:8px;">
                <div class="checkin-progress-fill" style="width: ${pPct}%; background:var(--border-color);"></div>
            </div>
        `;
    }

    let myProgressHtml = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:0.8em; font-weight:900; font-style:italic;">${sender === 'user' ? '我' : '我的进度'}</div>
            <div class="checkin-progress-text">${ci.checkedDates.length} / ${ci.targetDays} 天</div>
        </div>
        <div class="checkin-progress-bar" style="margin-bottom:0; height:8px;">
            <div class="checkin-progress-fill" style="width: ${progressPct}%;"></div>
        </div>
    `;

    const htmlStr = `
        <div class="checkin-chat-card">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 2px;">
                <div style="font-weight:900; font-size:1.15em; letter-spacing:1px; line-height:1.3; max-width: 65%;">
                    <span style="font-size:0.7em; background:var(--text-color); color:var(--bg-color); padding:2px 4px; border-radius:4px; vertical-align:middle; margin-right:4px;">打卡</span>
                    <br/>${ci.title}
                </div>
                <div class="checkin-avatars" style="margin-bottom:0; flex-shrink: 0;">${avatarsHtml}</div>
            </div>
            <div style="font-size:0.85em; font-weight:900; font-style:italic; margin-top:4px;">${statusText}</div>
            ${myProgressHtml}
            ${pProgressHtml}
        </div>
    `;
    
    if (sender === 'user') {
        const qData = currentQuoteData; clearQuote();
        await saveAndRenderMsg('user', htmlStr, null, Date.now(), true, null, qData);
        if (!isBatchMode) simulateReadAndReply();
    } else {
        // 梦角自动发送时，如果在当前聊天界面则直接渲染，否则静默保存后台
        if (currentCharacter && currentCharacter.id === ci.partnerId) {
            await saveAndRenderMsg(ci.partnerId, htmlStr, null, Date.now(), true);
        } else {
            const history = await getFromDB('chatHistory', ci.partnerId) || { value: [] };
            history.value.push({ sender: ci.partnerId, text: htmlStr, timestamp: Date.now() });
            await putToDB('chatHistory', { key: ci.partnerId, value: history.value });
            const cl = document.getElementById(`chatItem_${ci.partnerId}`);
            if (cl) {
                const preview = cl.querySelector('.chat-preview');
                if (preview) preview.innerText = "[打卡分享]";
            }
        }
    }
}

/* ================= 写信系统核心逻辑 ================= */
let letterDataList = [];
let notifiedLetterIds = new Set(); // 用于防止重复弹窗通知

async function openLetterModal() {
    document.getElementById('appPanel').style.display = 'none';
    
    // 1. 先在后台偷偷读数据
    const lData = await getFromDB('settings', 'letterData');
    if (lData) letterDataList = lData.value;
    document.getElementById('proactiveLetterToggle').checked = (currentSettings.taProactiveLetter === "true");
    
    // 2. 读完数据后，瞬间显示弹窗并排版！
    document.getElementById('letterModal').style.display = 'flex';
    switchLetterTab('inbox');
}

function switchLetterTab(tab) {
    document.getElementById('letterTabInbox').classList.remove('active');
    document.getElementById('letterTabSent').classList.remove('active');
    document.getElementById('letterTabWrite').classList.remove('active');
    document.getElementById('letter-tab-inbox').style.display = 'none';
    document.getElementById('letter-tab-sent').style.display = 'none';
    document.getElementById('letter-tab-write').style.display = 'none';
    
    if (tab === 'inbox') {
        document.getElementById('letterTabInbox').classList.add('active');
        document.getElementById('letter-tab-inbox').style.display = 'flex';
        renderLetterInbox();
    } else if (tab === 'sent') {
        document.getElementById('letterTabSent').classList.add('active');
        document.getElementById('letter-tab-sent').style.display = 'flex';
        renderLetterSent();
    } else if (tab === 'write') {
        document.getElementById('letterTabWrite').classList.add('active');
        document.getElementById('letter-tab-write').style.display = 'flex';
    }
}

function formatLetterTime(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// 渲染收信箱（只显示当前角色的信件）
function renderLetterInbox() {
    const container = document.getElementById('inboxListRender');
    container.innerHTML = '';
    const now = Date.now();
    
    const inbox = letterDataList.filter(l => l.sender === 'char' && l.arriveTime <= now && (!l.chatId || l.chatId === currentChatId))
                                .sort((a,b) => b.arriveTime - a.arriveTime);
    
    if (inbox.length === 0) {
        container.innerHTML = '<div style="text-align:center; opacity:0.5; font-weight:900; padding:40px 0; font-style:italic;">邮箱里空空如也...</div>';
        return;
    }
    
    inbox.forEach(l => {
        const item = document.createElement('div');
        item.className = `letter-item ${l.isRead ? '' : 'unread'}`;
        item.style.opacity = l.isRead ? '0.7' : '1';
        let senderName = l.charName || currentSettings.charName || 'TA';
        item.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:6px;">
                <div style="font-weight:900; font-size:1.1em; display:flex; align-items:center; gap:8px;">
                    ${l.isRead ? '' : '<span class="unread-dot"></span>'}
                    来自 ${senderName} 的回信
                </div>
                <div style="font-size:0.8em; opacity:0.8; font-style:italic; display:flex; align-items:center; gap:6px;">
                    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    抵达: ${formatLetterTime(l.arriveTime)}
                </div>
            </div>
            <button class="icon-btn" style="border:none; color:#ff4444; padding:5px; box-shadow:none; background:transparent;" onclick="deleteLetter('${l.id}', event)">✖</button>
        `;
        item.onclick = () => openReadLetter(l);
        container.appendChild(item);
    });
}

// 渲染发信箱
function renderLetterSent() {
    const container = document.getElementById('letter-tab-sent');
    container.innerHTML = '';
    const sent = letterDataList.filter(l => l.sender === 'user' && (!l.chatId || l.chatId === currentChatId))
                               .sort((a,b) => b.sendTime - a.sendTime);
    
    if (sent.length === 0) {
        container.innerHTML = '<div style="text-align:center; opacity:0.5; font-weight:900; padding:40px 0; font-style:italic;">还没寄出过任何信件呢~</div>';
        return;
    }
    
    sent.forEach(l => {
        const item = document.createElement('div');
        item.className = 'letter-item';
        item.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:6px; flex:1; min-width:0; padding-right: 15px;">
                <div style="font-weight:900; font-size:1.1em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${l.content.substring(0, 15)}...</div>
                <div style="font-size:0.8em; opacity:0.8; font-style:italic; display:flex; align-items:center; gap:6px;">
                    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2.5"><path d="M22 2 11 13"></path><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    寄出: ${formatLetterTime(l.sendTime)}
                </div>
            </div>
            <button class="icon-btn" style="border:none; color:#ff4444; padding:5px; box-shadow:none; background:transparent; flex-shrink:0;" onclick="deleteLetter('${l.id}', event)">✖</button>
        `;
        item.onclick = () => openReadLetter(l);
        container.appendChild(item);
    });
}

async function openReadLetter(letter) {
    document.getElementById('readLetterModal').style.display = 'flex';
    let senderName = letter.sender === 'user' ? '发件人: 我' : `寄件人: ${letter.charName || currentSettings.charName || 'TA'}`;
    document.getElementById('readLetterSender').innerText = senderName;
    document.getElementById('readLetterPaper').innerText = letter.content;
    document.getElementById('readLetterTime').innerText = formatLetterTime(letter.sender === 'user' ? letter.sendTime : letter.arriveTime);
    
    if (letter.sender === 'char' && !letter.isRead) {
        letter.isRead = true;
        await putToDB('settings', { key: 'letterData', value: letterDataList });
        renderLetterInbox(); 
    }
}

async function deleteLetter(id, e) {
    e.stopPropagation();
    showCustomConfirm('确定要销毁这封信件吗？', async () => {
        letterDataList = letterDataList.filter(l => l.id !== id);
        await putToDB('settings', { key: 'letterData', value: letterDataList });
        if (document.getElementById('letterTabInbox').classList.contains('active')) renderLetterInbox();
        else renderLetterSent();
    });
}

// 悬浮窗提示
function showLetterToast(msg) {
    let t = document.createElement('div');
    t.style.cssText = 'position:fixed; bottom:120px; left:50%; transform:translateX(-50%); background:var(--text-color); color:var(--bg-color); padding:12px 20px; border-radius:24px; font-weight:900; font-size:0.95em; z-index:999999; opacity:0; transition:opacity 0.3s; pointer-events:none; box-shadow:0 4px 10px rgba(0,0,0,0.2); text-align:center; white-space:pre-wrap; line-height: 1.5;';
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(()=>t.style.opacity='1', 10);
    setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 2500);
}

async function sendUserLetter() {
    const content = document.getElementById('letterWriteInput').value.trim();
    if (!content) {
        showLetterToast('信件内容不能为空哦！');
        return;
    }
    
    let activeChar = charactersList.find(c => c.id === currentChatId);
    let targetName = activeChar ? activeChar.name : (currentSettings.charName || 'TA');
    
    const now = Date.now();
    const userLetter = {
        id: 'ltr_u_' + now, sender: 'user', chatId: currentChatId, charName: targetName,
        content: content, sendTime: now, arriveTime: now
    };
    letterDataList.push(userLetter);
    
    const delayMs = Math.floor((Math.random() * 24 + 24) * 60 * 60 * 1000);
    const arriveTime = now + delayMs;
    
    const allWords = await getAllFromDB('wordCards');
    const taContent = generateTaLetterContent(allWords, targetName);
    
    const taLetter = {
        id: 'ltr_t_' + Date.now(), sender: 'char', chatId: currentChatId, charName: targetName,
        content: taContent, sendTime: now, arriveTime: arriveTime, isRead: false
    };
    letterDataList.push(taLetter);
    
    await putToDB('settings', { key: 'letterData', value: letterDataList });
    document.getElementById('letterWriteInput').value = '';
    
    showLetterToast('信件已交由邮差寄出！\n预计将在 1~2 天内收到回信。');
    
    switchLetterTab('sent');
    
// 发信后立刻重新计算下一个定时器唤醒时间
    checkUnreadLetters();
}

async function toggleProactiveLetter() {
    currentSettings.taProactiveLetter = document.getElementById('proactiveLetterToggle').checked ? "true" : "false";
    if (currentSettings.taProactiveLetter === "true" && !currentSettings.nextProactiveLetterTime) {
        currentSettings.nextProactiveLetterTime = Date.now() + (Math.random() * 2 + 1) * 24 * 60 * 60 * 1000;
    }
    await putToDB('settings', { key: 'config', value: currentSettings });
    // 状态改变，重新计算睡眠锚点
    checkUnreadLetters();
}

// 智能拼凑字卡并代入寄件人姓名
function generateTaLetterContent(cards, charName) {
    if (!cards || cards.length === 0) return "（拿起笔想给你回信，但字卡库空空如也，不知该从何说起呢...）";
    
    const numCards = Math.floor(Math.random() * 6) + 5;
    let letterText = "";
    
    for (let i = 0; i < numCards; i++) {
        const cardText = cards[Math.floor(Math.random() * cards.length)].text.trim();
        letterText += cardText;
        
        // 递减概率插入符号
        if (i < numCards - 1) {
            const r = Math.random();
            if (r < 0.50) letterText += "，"; 
            else if (r < 0.75) letterText += "。"; 
            else if (r < 0.90) letterText += "！"; 
            else if (r < 0.95) letterText += "……"; 
            else letterText += "。\n\n";
        } else {
            letterText += "。";
        }
    }
    
    const greetings = ["亲爱的：\n\n", "见字如面，\n\n", "展信佳。\n\n", "致我最想念的你：\n\n", ""];
    const signoffs = ["\n\n祝好，\n", "\n\n想你的，\n", "\n\n盼复。\n", "\n\n永远陪伴你的，\n"];
    
    const greet = greetings[Math.floor(Math.random() * greetings.length)];
    const sign = signoffs[Math.floor(Math.random() * signoffs.length)] + (charName || "TA");
    
    return greet + letterText + sign;
}

// ================= 精准睡眠唤醒架构 (0后台耗电) =================

let checkinTimer = null;

// 梦角后台自动打卡机制
async function checkPartnerCheckins() {
    const dbData = await getFromDB('settings', 'checkinData');
    if(!dbData || !dbData.value) return;
    let list = dbData.value;
    let changed = false;
    let todayStr = new Date().toLocaleDateString();
    let now = Date.now();
    
    let nextEarliestTime = null; // 记录距离现在最近的一次未来打卡时间
    
    for(let ci of list) {
        if(ci.mode === 'duo' && ci.partnerCheckEnabled) {
            if(!ci.partnerCheckedDates) ci.partnerCheckedDates = [];
            // 如果梦角目标已达成，跳过
            if(ci.partnerCheckedDates.length >= ci.targetDays) continue;
            
            // 判断梦角今天是否还没打卡
            if(!ci.partnerCheckedDates.includes(todayStr)) {
                // 如果今天还没有分配随机打卡时间，随机分配一个（从现在起的 0~8 小时内）
                if(!ci.nextPartnerCheckinTime || new Date(ci.nextPartnerCheckinTime).toLocaleDateString() !== todayStr) {
                    ci.nextPartnerCheckinTime = now + Math.floor(Math.random() * (8 * 60 * 60 * 1000));
                    changed = true;
                }
                
                // 时间到了！梦角执行打卡
                if(now >= ci.nextPartnerCheckinTime) {
                    ci.partnerCheckedDates.push(todayStr);
                    changed = true;
                    // 如果打卡列表界面正开着，立刻刷新界面
                    checkinDataList = list;
                    if(document.getElementById('checkinModal').style.display === 'flex') renderCheckinList();
                    
                    // 50% 概率将打卡卡片分享给你
                    if(Math.random() < 0.5) {
                        setTimeout(() => shareCheckin(ci.id, 'char'), 1500);
                    }
                } else {
                    // 时间还没到，记录下这个未来锚点
                    if (!nextEarliestTime || ci.nextPartnerCheckinTime < nextEarliestTime) {
                        nextEarliestTime = ci.nextPartnerCheckinTime;
                    }
                }
            }
        }
    }
    if(changed) {
        await putToDB('settings', { key: 'checkinData', value: list });
    }

    // 【核心优化】：精准睡眠，到时间自动唤醒，不浪费一丁点后台性能
    if (checkinTimer) clearTimeout(checkinTimer);
    if (nextEarliestTime && nextEarliestTime > now) {
        checkinTimer = setTimeout(checkPartnerCheckins, (nextEarliestTime - now) + 1000);
    }
}


let letterTimer = null;

// 写信系统后台精准监控
async function checkUnreadLetters() {
    const lData = await getFromDB('settings', 'letterData');
    if (!lData) return;
    letterDataList = lData.value;
    
    const now = Date.now();
    let newArrivedCount = 0;
    let nextEarliestTime = null; // 记录下一次最近的信件相关事件时间
    
    letterDataList.forEach(l => {
        if (l.sender === 'char' && !l.isRead && !notifiedLetterIds.has(l.id)) {
            if (l.arriveTime <= now) {
                newArrivedCount++;
                notifiedLetterIds.add(l.id); 
            } else {
                // 还没送达，记录这个送达时间
                if (!nextEarliestTime || l.arriveTime < nextEarliestTime) {
                    nextEarliestTime = l.arriveTime;
                }
            }
        }
    });
    
    // 全局悬浮提示收到来信
if (newArrivedCount > 0) {
    let t = document.createElement('div');
    // 增加 white-space:nowrap; 强制一行，增加 transition:opacity 0.3s; 做淡出
    t.style.cssText = 'position:fixed; top:75px; left:50%; transform:translateX(-50%); background:var(--text-color); color:var(--bg-color); padding:10px 20px; border-radius:24px; font-weight:900; font-size:0.9em; z-index:999999; box-shadow:0 6px 15px rgba(0,0,0,0.15); cursor:pointer; display:flex; align-items:center; gap:8px; white-space:nowrap; opacity:0; transition:opacity 0.3s ease-out;';
    t.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg> 邮差送来了 ${newArrivedCount} 封新信件`;
    t.onclick = () => { t.remove(); openLetterModal(); };
    document.body.appendChild(t);
    
    // 停留时间改短到3.5秒（原本是8秒），并丝滑淡出
    setTimeout(() => { 
        if (t.parentNode) {
            t.style.opacity = '0';
            setTimeout(() => { if (t.parentNode) t.remove(); }, 300);
        }
    }, 3500); 
}
    
    // 主动写信逻辑
    if (currentSettings.taProactiveLetter === "true") {
        if (currentSettings.nextProactiveLetterTime) {
            if (now >= currentSettings.nextProactiveLetterTime) {
                // 时间到了，立刻执行主动写信
                let activeChar = charactersList.find(c => c.id === currentChatId);
                let charName = activeChar ? activeChar.name : (currentSettings.charName || 'TA');
    
                const allW = await getAllFromDB('wordCards');
                const taContent = "【寄件人主动来信】\n\n" + generateTaLetterContent(allW, charName);
                
                const taLetter = {
                    id: 'ltr_t_p_' + Date.now(),
                    sender: 'char',
                    chatId: currentChatId, 
                    charName: charName,
                    content: taContent,
                    sendTime: now,
                    arriveTime: now, 
                    isRead: false
                };
                letterDataList.push(taLetter);
                await putToDB('settings', { key: 'letterData', value: letterDataList });
                
                // 安排下一次主动来信的时间 (顺延 2~4 天)
                currentSettings.nextProactiveLetterTime = Date.now() + (Math.random() * 2 + 2) * 24 * 60 * 60 * 1000;
                await putToDB('settings', { key: 'config', value: currentSettings });
                
                // 立刻递归查一次，触发刚才那封信的弹窗
                checkUnreadLetters();
                return; // 直接返回，把定时器计算交给下一轮
            } else {
                // 还没到写信时间，记录锚点
                if (!nextEarliestTime || currentSettings.nextProactiveLetterTime < nextEarliestTime) {
                    nextEarliestTime = currentSettings.nextProactiveLetterTime;
                }
            }
        }
    }

    // 【核心优化】：精准睡眠唤醒
    if (letterTimer) clearTimeout(letterTimer);
    if (nextEarliestTime && nextEarliestTime > now) {
        letterTimer = setTimeout(checkUnreadLetters, (nextEarliestTime - now) + 1000);
    }
}


// === 系统启动对账 ===
setTimeout(() => { 
    checkPartnerCheckins();
    checkUnreadLetters(); 
    checkPendingDiaryTasks();
}, 2000);

// ====== 随机念头卡片功能 ======
function openRandomCardModal() {
    document.getElementById('sideToolbar').classList.remove('open');
    document.getElementById('slotAInput').value = currentSettings.cardSlotA || "想\n希望\n要求";
    document.getElementById('slotBInput').value = currentSettings.cardSlotB || "更换\n要\n检查";
    document.getElementById('slotCInput').value = currentSettings.cardSlotC || "备注\n字卡\n系统权限";
    document.getElementById('randomCardModal').style.display = 'flex';
}

async function saveRandomCardSettings() {
    currentSettings.cardSlotA = document.getElementById('slotAInput').value.trim();
    currentSettings.cardSlotB = document.getElementById('slotBInput').value.trim();
    currentSettings.cardSlotC = document.getElementById('slotCInput').value.trim();
    await putToDB('settings', { key: 'config', value: currentSettings });
    document.getElementById('randomCardModal').style.display = 'none';
}

/* ================= 完美红包系统逻辑 ================= */
function openRedPacketModal() {
    document.getElementById('sideToolbar').classList.remove('open');
    if (!currentSettings.aiRedPacketBalance) currentSettings.aiRedPacketBalance = 0;
    document.getElementById('rpAiBalanceVal').innerText = parseFloat(currentSettings.aiRedPacketBalance).toFixed(2);
    document.getElementById('rpSendAmount').value = '';
    document.getElementById('rpSendMessage').value = ''; 
    document.getElementById('redPacketModal').style.display = 'flex';
}

async function setAiBalance() {
    // 动态创建一个好看的充值弹窗
    let div = document.createElement('div');
    div.id = 'rechargeModal';
    div.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:999999;display:flex;justify-content:center;align-items:center;';
    div.innerHTML = `
        <div style="background:var(--panel-bg);padding:20px 25px;border:4px solid var(--border-color);border-radius:12px;width:85%;max-width:300px;box-shadow: 6px 6px 0 var(--border-color); display:flex; flex-direction:column; gap:15px; animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
            <div style="text-align:center;font-weight:900;font-size:1.2em;font-style:italic;letter-spacing:1px;color:var(--text-color);">TOP UP</div>
            
            <div style="font-size:0.85em; font-weight:900; opacity:0.8; text-align:center;">为 TA 的小金库充值</div>
            
            <div style="display:flex; align-items:center; border: 3px solid var(--border-color); border-radius: 8px; background: var(--bg-color); padding: 8px 12px;">
                <span style="font-weight:900; font-size:1.2em; margin-right:8px; color:var(--text-color);">¥</span>
                <input type="number" id="rechargeInput" value="${currentSettings.aiRedPacketBalance || 0}" step="0.01" style="flex:1; width: 100%; background:transparent; border:none; color:var(--text-color); font-weight:900; font-size:1.2em; outline:none;">
            </div>
            
            <div style="display:flex;gap:12px;margin-top:10px;">
                <button class="outline-btn" style="flex:1;margin:0;padding:12px;border-radius:8px;" onclick="document.getElementById('rechargeModal').remove()">取消</button>
                <button class="action-btn" style="flex:1;margin:0;padding:12px;border-radius:8px;font-size:1.1em;background:#ff6b6b;color:#fff;border:2px solid var(--border-color);box-shadow:2px 2px 0 var(--border-color);" onclick="confirmRecharge()">确定</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}

window.confirmRecharge = async function() {
    const val = document.getElementById('rechargeInput').value;
    const amount = parseFloat(val);
    if (!isNaN(amount) && amount >= 0) {
        currentSettings.aiRedPacketBalance = amount;
        await putToDB('settings', { key: 'config', value: currentSettings });
        document.getElementById('rpAiBalanceVal').innerText = currentSettings.aiRedPacketBalance.toFixed(2);
        document.getElementById('rechargeModal').remove();
    } else {
        showCustomConfirm("请输入正确的金额数字哦！", () => {});
    }
};

async function resetAiBalance() {
    if (confirm("确定要清空TA的余额吗？")) {
        currentSettings.aiRedPacketBalance = 0;
        await putToDB('settings', { key: 'config', value: currentSettings });
        document.getElementById('rpAiBalanceVal').innerText = "0.00";
    }
}

// 升级版：带ID、身份和点击事件的红包生成器
function generateRedPacketHtml(amount, title = "大吉大利，万事如意", rpId, sender, status = "") {
    let displayDesc = amount > 0 ? `金额：${parseFloat(amount).toFixed(2)} 元` : `金额：0.00 元 (空包)`;
    let extraClass = status ? ` ${status}` : ""; // opened 或 returned
    
    return `
        <div class="red-packet-card${extraClass}" id="rp_${rpId}" onclick="handleRedPacketClick('${rpId}', '${sender}', ${amount})">
            <div class="rp-top">
                <div class="rp-icon">¥</div>
                <div class="rp-content">
                    <div class="rp-title">${title}</div>
                    <div class="rp-desc">${displayDesc}</div>
                </div>
            </div>
            <div class="rp-bottom"><span style="display:none;">红包</span></div>
        </div>
    `;
}

async function sendRedPacketToAi() {
    const amountInput = document.getElementById('rpSendAmount').value;
    const amount = parseFloat(amountInput);
    const memoInput = document.getElementById('rpSendMessage').value.trim();
    const finalMemo = memoInput ? memoInput : "恭喜发财，大吉大利"; 
    
    if (!amount || amount <= 0) {
        showCustomConfirm("请输入正确的红包金额！", () => {});
        return;
    }
    
    document.getElementById('redPacketModal').style.display = 'none';
    
    // 生成唯一红包ID
    const rpId = 'rp_' + Date.now();
    const htmlStr = generateRedPacketHtml(amount, finalMemo, rpId, 'user');
    const qData = currentQuoteData; clearQuote();
    
    // 1. 先把红包发出去
    await saveAndRenderMsg('user', htmlStr, null, Date.now(), true, null, qData);
    setTimeout(() => { if (typeof scrollToBottom === 'function') scrollToBottom(true); }, 50);
    
    if (!isBatchMode) simulateReadAndReply();

    // 2. 延迟 2~5 秒，模拟 TA 看到红包并做出反应
    setTimeout(async () => {
        const rpEl = document.getElementById('rp_' + rpId);
        if (!rpEl || rpEl.classList.contains('opened') || rpEl.classList.contains('returned')) return;

        let roll = Math.random(); // 掷骰子决定命运
        let cName = currentSettings.charName || "TA";
        
        // 专属系统消息图标
        let sysPrefix = currentSettings.themeStyle === 'wechat' ? ' ' : 'Pay | ';

        if (roll < 0.45) {
            // 【45% 概率：开心领取】
            if (!currentSettings.aiRedPacketBalance) currentSettings.aiRedPacketBalance = 0;
            currentSettings.aiRedPacketBalance += amount;
            await putToDB('settings', { key: 'config', value: currentSettings });
            
            updateRedPacketStateUI(rpId, 'opened');
            await saveAndRenderMsg('system', `${sysPrefix}${cName} 领取了你的红包`, null, Date.now(), true);
            
        } else if (roll < 0.90) {
            // 【45% 概率：傲娇退回】
            updateRedPacketStateUI(rpId, 'returned');
            await saveAndRenderMsg('system', `${sysPrefix}${cName} 退回了你的红包`, null, Date.now(), true);
            
        } else {
            // 【10% 概率：直接无视】
            // 啥也不干，红包保持可点击状态
        }
    }, Math.random() * 3000 + 2000); 
}

// 拦截原生消息引擎：注入 AI 的 3% 发红包概率
const originalTriggerYumeReplyRP = triggerYumeReply;
triggerYumeReply = async function() {
    // 先让 TA 走正常的回复流程（发字卡/表情）
    await originalTriggerYumeReplyRP();
    
// === 注入 5% 概率掉落随机念头卡片 ===
if (Math.random() < 0.05) {
    await delay(1200); // 停顿一下假装在思考
    
    // 默认文案改得更自然
    let listA = (currentSettings.cardSlotA || "想\n希望\n打算").split('\n').filter(i=>i.trim());
    let listB = (currentSettings.cardSlotB || "换一个\n看看\n检查").split('\n').filter(i=>i.trim());
    let listC = (currentSettings.cardSlotC || "专属备注\n字卡\n聊天背景").split('\n').filter(i=>i.trim());

    let valA = listA[Math.floor(Math.random() * listA.length)] || "";
    let valB = listB[Math.floor(Math.random() * listB.length)] || "";
    let valC = listC[Math.floor(Math.random() * listC.length)] || "";

    let activeChar = charactersList.find(c => c.id === currentChatId) || charactersList[0];
    let cName = activeChar.name;

    // 去掉中二的 SYSTEM，换成干净柔和的 SUDDEN THOUGHT 和一个小气泡图标
    let cardHtml = `
        <div class="sudden-thought-card">
            <div class="event-card-top">
                <span>SUDDEN THOUGHT</span>
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </div>
            <div class="event-card-body">
                ${cName} ${valA} ${valB} <span style="text-decoration: underline; text-underline-offset: 4px;">${valC}</span>
            </div>
        </div>
    `;

    const typingIndicator = document.getElementById('typingIndicator');
    document.getElementById('chatContainer').appendChild(typingIndicator);
    typingIndicator.style.display = 'flex';
    setTimeout(() => { if (typeof scrollToBottom === 'function') scrollToBottom(false); }, 50);

    await delay(1000); 
    await saveAndRenderMsg('yume', cardHtml, null, Date.now(), true, activeChar);
    
    typingIndicator.style.display = 'none';
    document.body.appendChild(typingIndicator);
}
    
    // === 注入 5% 概率 TA 随机分享播放列表里的一首歌 ===
if (cachedMusicList && cachedMusicList.length > 0 && Math.random() < 0.05) {
    await delay(1500); // 假装在挑歌
    const randomIdx = Math.floor(Math.random() * cachedMusicList.length);
    await shareMusicCard(randomIdx, 'char');
}
    // 回复完之后，3% 的概率额外给你弹一个红包！
    if (Math.random() < 0.03) {
        await delay(1000); // 停顿一秒钟，像是它发完消息突然想起来给你发红包
        
        let sendAmount = 0;
        let rpTitle = "大吉大利，万事如意"; // 默认 70% 的概率是这个文案
        
        // 1. 判断余额
        if (currentSettings.aiRedPacketBalance && currentSettings.aiRedPacketBalance > 0) {
            let maxAmount = parseFloat(currentSettings.aiRedPacketBalance);
            sendAmount = parseFloat((Math.random() * maxAmount).toFixed(2));
            if (sendAmount <= 0) sendAmount = 0.01;
            if (sendAmount > maxAmount) sendAmount = maxAmount;
            
            // 扣钱
            currentSettings.aiRedPacketBalance = parseFloat((currentSettings.aiRedPacketBalance - sendAmount).toFixed(2));
            await putToDB('settings', { key: 'config', value: currentSettings });
        } else {
            // 余额不足，变成空包 0.00
            sendAmount = 0;
        }
        
        // 2. 判断文案 (30%概率从字卡里抽)
        if (Math.random() < 0.30) {
            const allWords = await getAllFromDB('wordCards');
            let validWords = allWords;
            let activeChar = charactersList.find(c => c.id === currentChatId) || charactersList[0];
            let charReplyGroups = activeChar.activeReplyGroups || currentSettings.activeReplyGroups;
            if (charReplyGroups && charReplyGroups.length > 0) {
                validWords = allWords.filter(w => charReplyGroups.includes(w.category || '日常'));
            }
            if (validWords.length > 0) {
                rpTitle = validWords[Math.floor(Math.random() * validWords.length)].text;
            }
        }
        
        // 3. 渲染发送
        const rpId = 'rp_' + Date.now();
        const rpHtml = generateRedPacketHtml(sendAmount, rpTitle, rpId, 'char');
        // 为了防止找不到 replier，我们直接用当前主视角的角色
        let activeChar = charactersList.find(c => c.id === currentChatId) || charactersList[0];
        
        // 重新挂起输入动画
        const typingIndicator = document.getElementById('typingIndicator');
        document.getElementById('chatContainer').appendChild(typingIndicator);
        typingIndicator.style.display = 'flex';
        setTimeout(() => { if (typeof scrollToBottom === 'function') scrollToBottom(false); }, 50);
        
        await delay(800); // 假装在包红包
        await saveAndRenderMsg('yume', rpHtml, null, Date.now(), true, activeChar);
        
        typingIndicator.style.display = 'none';
        document.body.appendChild(typingIndicator);
    }
    
    // === 最后一步：触发 TA 检查是否需要去写日记 ===
    autoCheckDiaryToWrite();
};

/* ================= 桌宠宝宝系统核心 ================= */
let petState = 'IDLE'; // IDLE, WALK, DRAG
let petAnimFrame = null;
let petX = window.innerWidth / 2, petY = window.innerHeight - 150;
let petTargetX = petX, petTargetY = petY;
let petFacingRight = true;

function openPetModal() {
    document.getElementById('appPanel').style.display = 'none';
    document.getElementById('petModal').style.display = 'flex';
}
function closePetModal() {
    document.getElementById('petModal').style.display = 'none';
}

function updatePetSettingsUI() {
    document.getElementById('petSizeVal').innerText = document.getElementById('petSizeInput').value;
    document.getElementById('petSpeedVal').innerText = document.getElementById('petSpeedInput').value;
    saveAndApplyPetSettings();
}

async function togglePetEnabled() {
    currentSettings.petEnabled = document.getElementById('enablePetToggle').checked ? "true" : "false";
    await saveAndApplyPetSettings();
}

async function saveAndApplyPetSettings() {
    currentSettings.petSize = document.getElementById('petSizeInput').value;
    currentSettings.petSpeed = document.getElementById('petSpeedInput').value;
    currentSettings.petRoam = document.getElementById('petRoamToggle').checked ? "true" : "false";
    
    const idleInput = document.getElementById('petIdleUrlInput').value;
    if (idleInput !== '[已加载本地图包 - 勿修改]') currentSettings.petIdleUrl = idleInput;
    const walkInput = document.getElementById('petWalkUrlInput').value;
    if (walkInput !== '[已加载本地图包 - 勿修改]') currentSettings.petWalkUrl = walkInput;
    const dragInput = document.getElementById('petDragUrlInput').value;
    if (dragInput !== '[已加载本地图包 - 勿修改]') currentSettings.petDragUrl = dragInput;

    await putToDB('settings', { key: 'config', value: currentSettings });
    applyPetCore();
}

function handlePetImgUpload(e, key) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        currentSettings[key] = event.target.result;
        updateInputDisplay(key + 'Input', currentSettings[key]);
        await saveAndApplyPetSettings();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

function applyPetCore() {
    const pet = document.getElementById('desktopPet');
    if (currentSettings.petEnabled === "true") {
        pet.style.display = 'flex';
        pet.style.width = (currentSettings.petSize || 100) + 'px';
        pet.style.height = (currentSettings.petSize || 100) + 'px';
        
        // 如果是从外面超出了屏幕范围，拉回来
        if (petX > window.innerWidth || petY > window.innerHeight) {
            petX = window.innerWidth / 2;
            petY = window.innerHeight - (currentSettings.petSize || 100) - 20;
        }
        
        updatePetVisuals();
        if (!petAnimFrame) petLoop();
    } else {
        pet.style.display = 'none';
        if (petAnimFrame) { cancelAnimationFrame(petAnimFrame); petAnimFrame = null; }
    }
}

function updatePetVisuals() {
    const pet = document.getElementById('desktopPet');
    let url = currentSettings.petIdleUrl; // 默认
    if (petState === 'WALK' && currentSettings.petWalkUrl) url = currentSettings.petWalkUrl;
    if (petState === 'DRAG' && currentSettings.petDragUrl) url = currentSettings.petDragUrl;
    
    if (url && url.trim() !== '') {
        pet.style.backgroundImage = `url(${url})`;
        pet.style.backgroundColor = "transparent";
        pet.style.border = "none";
        pet.innerText = "";
    } else {
        // 如果什么图都没传，给个默认可爱的颜文字团子
        pet.style.backgroundImage = `none`;
        pet.style.backgroundColor = "var(--panel-bg)";
        pet.style.border = "3px solid var(--border-color)";
        pet.style.borderRadius = "20px";
        pet.innerText = "(。-ω-)";
        pet.style.color = "var(--text-color)";
        pet.style.justifyContent = "center";
        pet.style.alignItems = "center";
        pet.style.fontWeight = "900";
    }
    
    // 控制左右翻转 (如果是颜文字就不翻转防止字倒过来)
    if (url && url.trim() !== '') {
        pet.style.transform = `scaleX(${petFacingRight ? 1 : -1})`;
    } else {
        pet.style.transform = `scaleX(1)`;
    }
}

function petLoop() {
    if (currentSettings.petEnabled !== "true") return;
    const pet = document.getElementById('desktopPet');
    const speed = parseInt(currentSettings.petSpeed || 2);
    
    if (petState !== 'DRAG') {
        if (speed === 0) {
            petState = 'IDLE';
        } else {
            let dx = petTargetX - petX;
            let dy = petTargetY - petY;
            let dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < 5) {
                // 到达目标点，97%的概率原地休息，3%的概率找新目标
                if (Math.random() < 0.03) {
                    petState = 'WALK';
                    let pSize = parseInt(currentSettings.petSize || 100);
                    let maxW = window.innerWidth - pSize;
                    let maxH = window.innerHeight - pSize;
                    petTargetX = Math.random() * maxW;
                    
                    if(currentSettings.petRoam === "true") {
                        petTargetY = Math.random() * maxH;
                    } else {
                        // 底部漫游：锁定高度在底部附近
                        petTargetY = maxH - 20; 
                    }
                } else {
                    petState = 'IDLE';
                }
            } else {
                petState = 'WALK';
                if (Math.abs(dx) > 1) petFacingRight = dx > 0;
                let step = speed * 1.5; 
                // 走动
                petX += (dx / dist) * step;
                petY += (dy / dist) * step;
            }
        }
        
        pet.style.left = petX + 'px';
        pet.style.top = petY + 'px';
        updatePetVisuals();
    }
    
    petAnimFrame = requestAnimationFrame(petLoop);
}

// 拖拽互动交互
const desktopPetEl = document.getElementById('desktopPet');
let petDragStartX, petDragStartY;

desktopPetEl.addEventListener('touchstart', (e) => {
    if (currentSettings.petEnabled !== "true") return;
    petState = 'DRAG';
    updatePetVisuals();
    petDragStartX = e.touches[0].clientX - petX;
    petDragStartY = e.touches[0].clientY - petY;
}, {passive: false});

document.addEventListener('touchmove', (e) => {
    if (petState === 'DRAG') {
        e.preventDefault(); // 防止拖拽宝宝时导致网页滚动
        petX = e.touches[0].clientX - petDragStartX;
        petY = e.touches[0].clientY - petDragStartY;
        desktopPetEl.style.left = petX + 'px';
        desktopPetEl.style.top = petY + 'px';
    }
}, {passive: false});

document.addEventListener('touchend', (e) => {
    if (petState === 'DRAG') {
        petState = 'IDLE';
        // 松手时，把新的落脚点当成目标，这样它就不会突然跑回之前的地方
        petTargetX = petX;
        petTargetY = petY;
        updatePetVisuals();
    }
});

// === 页面可见性监听 (防挂机神器) ===
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        checkPartnerCheckins();
        checkUnreadLetters();
        checkPendingDiaryTasks();
    }
});

/* ================= 生理期/月经记录系统 (智能预测版) ================= */
let periodDataList = [];
let currentCalDate = new Date();

// 格式化日期为 YYYY-MM-DD
function getLocalDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function openPeriodModal() {
    document.getElementById('appPanel').style.display = 'none';
    
    // 1. 先读数据和预处理
    const data = await getFromDB('settings', 'periodData');
    periodDataList = data ? data.value : [];
    
    if (currentSettings.isPeriodActive === "true") {
        const todayStr = getLocalDateStr(new Date());
        if (!periodDataList.includes(todayStr)) {
            periodDataList.push(todayStr);
            await putToDB('settings', { key: 'periodData', value: periodDataList });
        }
    }

    // 2. 瞬间显示弹窗并画日历
    document.getElementById('periodModal').style.display = 'flex';
    currentCalDate = new Date(); 
    renderCalendar();
}

function closePeriodModal() {
    document.getElementById('periodModal').style.display = 'none';
}

function closePeriodModal() {
    document.getElementById('periodModal').style.display = 'none';
}

function changeCalMonth(delta) {
    currentCalDate.setMonth(currentCalDate.getMonth() + delta);
    renderCalendar();
}

// 核心大按钮：点击开始或结束
async function togglePeriodState() {
    if (currentSettings.isPeriodActive === "true") {
        currentSettings.isPeriodActive = "false"; // 结束大月经
    } else {
        currentSettings.isPeriodActive = "true";  // 开始大月经
        const todayStr = getLocalDateStr(new Date());
        if (!periodDataList.includes(todayStr)) {
            periodDataList.push(todayStr); // 立刻涂红今天
        }
    }
    await putToDB('settings', { key: 'config', value: currentSettings });
    await putToDB('settings', { key: 'periodData', value: periodDataList });
    renderCalendar();
}

// 手动点格子补签
async function togglePeriodDate(dateStr) {
    const index = periodDataList.indexOf(dateStr);
    if (index > -1) periodDataList.splice(index, 1);
    else periodDataList.push(dateStr);
    await putToDB('settings', { key: 'periodData', value: periodDataList });
    renderCalendar();
}

function renderCalendar() {
    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();
    document.getElementById('calMonthYear').innerText = `${year}年 ${month + 1}月`;
    
    // ---- 预测引擎 ----
    let lastStartTs = null;
    let predictStartTs = null;
    let predictEndTs = null;
    let currentDayCount = 0; 

    if (periodDataList.length > 0) {
        // 找出最后一次连续月经期的“第一天”
        let sorted = periodDataList.map(d => new Date(d).getTime()).sort((a,b) => a - b);
        let recentSegment = [sorted[sorted.length - 1]];
        const ONE_DAY = 86400000;
        
        for (let i = sorted.length - 2; i >= 0; i--) {
            // 如果两个日期差小于 1.5 天就算连续
            if (recentSegment[0] - sorted[i] <= ONE_DAY * 1.5) {
                recentSegment.unshift(sorted[i]);
            } else break;
        }
        lastStartTs = recentSegment[0]; // 提取出开头日
        
        if (currentSettings.isPeriodActive === "true") {
            const todayTs = new Date(getLocalDateStr(new Date())).getTime();
            currentDayCount = Math.floor((todayTs - lastStartTs) / ONE_DAY) + 1;
        }

        // 默认预测逻辑：上次开始的 28天后会来，持续 5 天
        predictStartTs = lastStartTs + 28 * ONE_DAY;
        predictEndTs = predictStartTs + 4 * ONE_DAY; 
    }

    // ---- 面板文字动态更新 ----
    const statusText = document.getElementById('periodStatusText');
    const actionBtn = document.getElementById('periodActionBtn');
    const pStartText = document.getElementById('predictStartText');
    const pEndText = document.getElementById('predictEndText');

    if (currentSettings.isPeriodActive === "true") {
        statusText.innerText = `正在经期中 (第 ${currentDayCount > 0 ? currentDayCount : 1} 天)`;
        actionBtn.innerText = "月经走了 (结束记录)";
        actionBtn.style.background = "#ff4444";
        actionBtn.style.color = "#fff";
    } else {
        if (predictStartTs) {
            const todayTs = new Date(getLocalDateStr(new Date())).getTime();
            const daysLeft = Math.floor((predictStartTs - todayTs) / 86400000);
            if (daysLeft > 0) statusText.innerText = `安全期 (距下次预计 ${daysLeft} 天)`;
            else statusText.innerText = `随时可能造访，请做好准备`;
        } else {
            statusText.innerText = `等待记录更多数据`;
        }
        actionBtn.innerText = "月经来了";
        actionBtn.style.background = "var(--text-color)";
        actionBtn.style.color = "var(--bg-color)";
    }

    if (predictStartTs) {
        let pS = new Date(predictStartTs);
        let pE = new Date(predictEndTs);
        pStartText.innerText = `${pS.getMonth()+1}月${pS.getDate()}日`;
        pEndText.innerText = `${pE.getMonth()+1}月${pE.getDate()}日`;
    } else {
        pStartText.innerText = "暂无数据";
        pEndText.innerText = "暂无数据";
    }

    // ---- 渲染日历网格 ----
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = getLocalDateStr(new Date());
    
    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'cal-day empty';
        grid.appendChild(empty);
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const isMarked = periodDataList.includes(dateStr);
        const isToday = dateStr === todayStr;
        
        let isPredicted = false;
        if (!isMarked && predictStartTs && predictEndTs) {
            const currentTs = new Date(dateStr).getTime();
            if (currentTs >= predictStartTs && currentTs <= predictEndTs) isPredicted = true;
        }
        
        const dayEl = document.createElement('div');
        dayEl.className = `cal-day ${isMarked ? 'marked' : ''} ${isToday ? 'today' : ''} ${isPredicted ? 'predicted' : ''}`;
        dayEl.innerText = i;
        dayEl.onclick = () => togglePeriodDate(dateStr); // 点格子也能手动改错漏签
        grid.appendChild(dayEl);
    }
}

// ================= 新增：侧边栏与强制回复逻辑 =================
// 切换侧边栏展开与收起
function toggleSideToolbar() {
    const toolbar = document.getElementById('sideToolbar');
    toolbar.classList.toggle('open');
}

// 强制让 TA 立刻回复一条消息
function forceTaReply() {
    toggleSideToolbar(); // 点完后自动收起侧边栏，手感更好
    
    if (isReplying) {
        // 如果 TA 正在打字中，给个优雅的悬浮轻提示
        let t = document.createElement('div');
        t.style.cssText = 'position:fixed; bottom:180px; left:50%; transform:translateX(-50%); background:var(--text-color); color:var(--bg-color); padding:8px 16px; border-radius:20px; font-weight:900; font-size:0.9em; z-index:999999; box-shadow:0 4px 10px rgba(0,0,0,0.2); pointer-events:none; opacity:0; transition:opacity 0.2s;';
        t.innerText = 'TA已经在输入中啦...';
        document.body.appendChild(t);
        setTimeout(() => t.style.opacity = '1', 10);
        setTimeout(() => {
            t.style.opacity = '0';
            setTimeout(() => t.remove(), 200);
        }, 1500);
        return;
    }
    
    // 强制触发现有的梦角回复引擎
    triggerYumeReply();
}

// ================= API 解读系统核心 =================
let defaultPersonas = [
    { name: "傲娇翻译官", prompt: "你是一个专门翻译傲娇发言的专家。请把对方的话翻译成实际上关心、喜欢但不好意思说出口的内心OS。语气要简短、可爱。" },
    { name: "病娇心理师", prompt: "你是一个病娇探测器。请把对方的话往极致的占有欲、病态的爱意方向解读，用第一人称（TA的内心）输出一小段OS。" },
    { name: "直球真诚版", prompt: "请穿透文字的伪装，解读出这句话背后最真诚、最柔软的潜台词，用一两句话概括TA的真实情感。" }
];

// 初始化数据
if (!currentSettings.apiPersonas) currentSettings.apiPersonas = defaultPersonas;
if (currentSettings.apiCurrentPersona === undefined) currentSettings.apiCurrentPersona = 0;

function openApiModal() {
    document.getElementById('sideToolbar').classList.remove('open'); // 收起侧边栏
    document.getElementById('apiEnableToggle').checked = currentSettings.apiEnabled === "true";
    document.getElementById('apiUrlInput').value = currentSettings.apiUrl || "";
    document.getElementById('apiKeyInput').value = currentSettings.apiKey || "";
    
    renderPersonaSelect();
    
    // 如果有保存的模型，放进下拉框
    const modelSel = document.getElementById('apiModelSelect');
    if (currentSettings.apiModel) {
        modelSel.innerHTML = `<option value="${currentSettings.apiModel}">${currentSettings.apiModel}</option>`;
    }
    
    document.getElementById('apiModal').style.display = 'flex';
}

function renderPersonaSelect() {
    const sel = document.getElementById('apiPersonaSelect');
    sel.innerHTML = '';
    currentSettings.apiPersonas.forEach((p, idx) => {
        sel.innerHTML += `<option value="${idx}">${p.name}</option>`;
    });
    sel.value = currentSettings.apiCurrentPersona;
    document.getElementById('apiPersonaPrompt').value = currentSettings.apiPersonas[currentSettings.apiCurrentPersona].prompt;
}

function changePersona() {
    const idx = document.getElementById('apiPersonaSelect').value;
    currentSettings.apiCurrentPersona = idx;
    document.getElementById('apiPersonaPrompt').value = currentSettings.apiPersonas[idx].prompt;
}

function addPersona() {
    const name = prompt("请输入新人格名称 (例如：毒舌吐槽):");
    if (name) {
        currentSettings.apiPersonas.push({ name: name, prompt: "请解读以下文字：" });
        currentSettings.apiCurrentPersona = currentSettings.apiPersonas.length - 1;
        renderPersonaSelect();
    }
}

async function fetchApiModels() {
    const url = document.getElementById('apiUrlInput').value.trim();
    const key = document.getElementById('apiKeyInput').value.trim();
    if (!url || !key) { alert("请先填写 URL 和 Key！"); return; }
    
    const btn = event.target;
    btn.innerText = "拉取中...";
    try {
        // 兼容大部分 OpenAI 格式的 /models 路由
        let fetchUrl = url.endsWith('/v1') ? url + '/models' : url.replace(/\/$/, '') + '/v1/models';
        const res = await fetch(fetchUrl, { headers: { "Authorization": "Bearer " + key }});
        const data = await res.json();
        if (data && data.data) {
            const sel = document.getElementById('apiModelSelect');
            sel.innerHTML = data.data.map(m => `<option value="${m.id}">${m.id}</option>`).join('');
            alert("拉取成功！请在下拉框选择模型。");
        } else {
            alert("拉取失败，请检查接口格式是否兼容。");
        }
    } catch (e) {
        alert("网络请求失败：" + e.message);
    }
    btn.innerText = "拉取模型";
}

async function saveApiSettings() {
    currentSettings.apiEnabled = document.getElementById('apiEnableToggle').checked ? "true" : "false";
    currentSettings.apiUrl = document.getElementById('apiUrlInput').value.trim();
    currentSettings.apiKey = document.getElementById('apiKeyInput').value.trim();
    if (document.getElementById('apiModelSelect').value) {
        currentSettings.apiModel = document.getElementById('apiModelSelect').value;
    }
    
    // 保存当前编辑的提示词
    const idx = currentSettings.apiCurrentPersona;
    currentSettings.apiPersonas[idx].prompt = document.getElementById('apiPersonaPrompt').value;
    
    await putToDB('settings', { key: 'config', value: currentSettings });
    document.getElementById('apiModal').style.display = 'none';
    refreshInterpretIcon(); // 刷新界面上的图标
}

// 核心：在最后一条 Yume 消息的头像下方添加放大镜
function refreshInterpretIcon() {
return;
    document.querySelectorAll('.interpret-btn').forEach(e => e.remove());
    if (currentSettings.apiEnabled !== "true") return;
    
    const yumeMsgs = document.querySelectorAll('.message.yume');
    if (yumeMsgs.length === 0) return;
    
    let targetAvatarBox = null;
    let targetBubble = null;
    let textToInterpret = "";
    
    // 倒着找最后一条带文字的消息
    for (let i = yumeMsgs.length - 1; i >= 0; i--) {
        const avatarBox = yumeMsgs[i].querySelector('.avatar-container');
        const textNode = yumeMsgs[i].querySelector('.bubble');
        if (avatarBox && textNode && textNode.textContent) {
            const clone = textNode.cloneNode(true);
            const quoteBox = clone.querySelector('.quote-box');
            if (quoteBox) quoteBox.remove();
            // 剔除掉以前已经翻译过的部分
            const transBox = clone.querySelector('.ai-translate-box');
            if (transBox) transBox.remove();
            
            const txt = clone.textContent.trim().replace(/[\n\r]/g, ' ');
            if (txt) {
                targetAvatarBox = avatarBox;
                targetBubble = textNode;
                textToInterpret = txt;
                break;
            }
        }
    }
    
    if (!targetAvatarBox || !textToInterpret) return;

    const btn = document.createElement('div');
    btn.className = 'interpret-btn';
    btn.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
    
    // 点击时，把气泡元素传过去
    btn.onclick = () => doAiInterpret(textToInterpret, targetBubble);
    targetAvatarBox.appendChild(btn);
}

// 请求大模型进行解读
// 请求大模型进行解读（微信式气泡内嵌）
async function doAiInterpret(text, bubbleEl) {
    if (!currentSettings.apiUrl || !currentSettings.apiKey || !currentSettings.apiModel) {
        showCustomConfirm("请先在侧边栏 API 设置中填好 URL、Key 和 模型！", () => {});
        return;
    }

    // 检查气泡里是不是已经有翻译框了，没有就建一个
    let transBox = bubbleEl.querySelector('.ai-translate-box');
    if (!transBox) {
        transBox = document.createElement('div');
        transBox.className = 'ai-translate-box';
        transBox.style.cssText = 'margin-top: 8px; padding-top: 8px; border-top: 2px dashed var(--border-color); font-size: 0.85em; display: flex; flex-direction: column; gap: 4px;';
        bubbleEl.appendChild(transBox);
    }

    // 显示加载动画
    transBox.innerHTML = `<div style="opacity: 0.6; font-size: 0.8em; font-style: italic;"> 潜台词：</div><div class="ai-loading-dots" style="text-align:left;"><span></span><span></span><span></span></div>`;
    // 让滚动条稍微往下走一点，露出新长出来的气泡
setTimeout(() => scrollToBottom(false), 50);

// --- 新增：获取最近 15 条聊天记录作为上下文 ---
let contextText = "";
if (typeof allMessagesCache !== 'undefined' && allMessagesCache.length > 0) {
    const recentMsgs = allMessagesCache.slice(-15);
    contextText = "【以下是最近的聊天上下文】\n" + recentMsgs.map(m => {
        let senderName = m.sender === 'user' ? '我' : 'TA';
        let msgText = m.text ? m.text.replace(/<[^>]+>/g, '').trim() : '[图片/其他]';
        return `${senderName}：${msgText}`;
    }).join('\n') + "\n\n";
}
// ----------------------------------------------

const sysPrompt = currentSettings.apiPersonas[currentSettings.apiCurrentPersona].prompt;
let endpoint = currentSettings.apiUrl.endsWith('/chat/completions') ? currentSettings.apiUrl : (currentSettings.apiUrl.replace(/\/$/, '') + '/chat/completions');

try {
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + currentSettings.apiKey
        },
        body: JSON.stringify({
    model: currentSettings.apiModel,
    messages: [
        // 在系统提示词后面强行拼接“禁止说废话”的指令
        { role: "system", content: sysPrompt + "\n\n【最高指令】你必须直接输出最终的解读内容！绝对禁止输出任何开场白、角色扮演声明、格式化前缀（例如绝对不能说“这是一份来自XX的解读”、“好的”、“为您分析”等废话）。直接给出核心潜台词！" },
        
        { role: "user", content: `${contextText}结合上述聊天语境，TA 刚才发给我：“${text}”。请你作为旁观者，客观分析 TA 说这句话的真实潜台词。请用第三人称解读，不要自我代入。不要加戏，不要废话，直接输出分析结果！` }
    ],
    temperature: 0.7
})
    });
        
        const data = await res.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
            transBox.innerHTML = `<div style="opacity: 0.6; font-size: 0.8em; font-style: italic;"> 潜台词：</div><div>${data.choices[0].message.content}</div>`;
        } else {
            transBox.innerHTML = `<div style="opacity: 0.6; font-size: 0.8em; font-style: italic;"> 潜台词：</div><div style="color:#ff4444;">解读失败: 接口返回异常</div>`;
        }
    } catch (e) {
        transBox.innerHTML = `<div style="opacity: 0.6; font-size: 0.8em; font-style: italic;"> 潜台词：</div><div style="color:#ff4444;">网络错误: ${e.message}</div>`;
    }
    
    // 渲染完毕再滚一次底
    setTimeout(() => scrollToBottom(false), 50);
}

/* ================= 纪念日系统核心 ================= */
let anniversaryDataList = [];
let tempAnniBgData = ''; // 存放上传的图片缓存

async function openAnniversaryModal() {
    document.getElementById('appPanel').style.display = 'none';
    const data = await getFromDB('settings', 'anniversaryData');
    anniversaryDataList = data ? data.value : [];
    document.getElementById('anniversaryModal').style.display = 'flex';
    renderAnniversaryList();
}

function closeAnniversaryModal() {
    document.getElementById('anniversaryModal').style.display = 'none';
}

function renderAnniversaryList() {
    const container = document.getElementById('anniversaryListRender');
    container.innerHTML = '';

    // 系统自动提取的相遇日
    let activeChar = charactersList.find(c => c.id === currentChatId);
    let charCreateTs = Date.now();
    if (activeChar && activeChar.id && activeChar.id.startsWith('char_')) {
        let ts = parseInt(activeChar.id.split('_')[1]);
        if (!isNaN(ts)) charCreateTs = ts;
    } else if (currentChatId === 'default') {
        const firstMsg = allMessagesCache.length > 0 ? allMessagesCache[0].timestamp : Date.now();
        charCreateTs = firstMsg;
    }
    
    // 渲染系统相遇日（读取你自定义的专属底图）
    let sysCard = createAnniversaryCard('相遇的那天', charCreateTs, true, currentSettings.sysAnniBg || "", -1);
    
    // 【新增隐藏彩蛋：点击卡片就能换背景图】
    sysCard.onclick = () => {
        let input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            let file = e.target.files[0];
            if(!file) return;
            let reader = new FileReader();
            reader.onload = async (ev) => {
                currentSettings.sysAnniBg = ev.target.result;
                await putToDB('settings', { key: 'config', value: currentSettings });
                renderAnniversaryList(); // 选完图自动刷新显示
            };
            reader.readAsDataURL(file);
        };
        input.click();
    };
    
    container.appendChild(sysCard);

    // 渲染自定义的纪念日
    if (anniversaryDataList && anniversaryDataList.length > 0) {
        anniversaryDataList.forEach((anni, index) => {
            if (!anni.chatId || anni.chatId === currentChatId) {
                container.appendChild(createAnniversaryCard(anni.title, anni.timestamp, false, anni.bgUrl, index));
            }
        });
    }
}

function createAnniversaryCard(title, timestamp, isSystem, bgUrl, index) {
    const now = new Date();
    const targetDate = new Date(timestamp);
    
    const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const targetZero = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
    
    let daysDiff = Math.floor((todayZero - targetZero) / (1000 * 60 * 60 * 24));
    let absDays = Math.abs(daysDiff);
    
    let dayPrefix = '';
    let dayNumHtml = `<div style="font-size:1.8em; font-weight:900; line-height:1; text-shadow:2px 2px 4px rgba(0,0,0,0.8);">${absDays} <span style="font-size:0.4em; margin-left:-2px;">天</span></div>`;
    
    if (daysDiff === 0) {
        dayPrefix = '就在';
        dayNumHtml = `<div style="font-size:1.4em; font-weight:900; line-height:1.2; text-shadow:2px 2px 4px rgba(0,0,0,0.8);">今天</div>`;
    } else if (daysDiff > 0) {
        dayPrefix = '已经过去';
    } else {
        dayPrefix = '距离还剩';
    }

    const card = document.createElement('div');
    
    // 背景图处理
    let finalBg = bgUrl || "";
    let bgStyle = finalBg ? `background-image:url(${finalBg}); background-size:cover; background-position:center; border-color:transparent;` : `background: var(--text-color);`;

    card.style.cssText = `position:relative; width:100%; height:140px; border-radius:12px; overflow:hidden; border:3px solid var(--border-color); box-shadow:4px 4px 0 var(--border-color); ${bgStyle}`;
    
    // 渐变黑幕让白字清晰
    let maskHtml = finalBg ? `<div style="position:absolute; inset:0; background: linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.85) 100%); pointer-events:none;"></div>` : '';

    // 【安全写法：名片风格的左上角小头像】
    let avatarImg = currentSettings.avatarUrl;
    let charInit = currentSettings.charName ? currentSettings.charName.charAt(0) : '梦';
    let avatarBg = avatarImg ? 'url(' + avatarImg + ')' : 'none';
    let innerText = avatarImg ? '' : charInit;

    let avatarHtml = `<div style="position:absolute; top:12px; left:12px; width:40px; height:40px; border-radius:var(--btn-radius, 50%); border:2px solid var(--border-color); background-color:var(--panel-bg); background-image:${avatarBg}; background-size:cover; background-position:center; display:flex; justify-content:center; align-items:center; font-weight:900; color:var(--text-color); z-index:5; box-shadow: 2px 2px 0 var(--border-color);">${innerText}</div>`;

    // 右上角半透明删除按钮
    let delBtnHtml = isSystem ? '' : `<button style="position:absolute; top:12px; right:12px; background:rgba(0,0,0,0.5); border:2px solid rgba(255,255,255,0.3); border-radius:50%; width:26px; height:26px; color:#fff; font-weight:900; font-size:12px; cursor:pointer; display:flex; justify-content:center; align-items:center; z-index:10;" onclick="deleteAnniversary(${index})">✕</button>`;
    
    // 专属小胶囊标签
    let tagHtml = isSystem ? `<span style="font-size:0.6em; background:#fff; color:#000; padding:2px 6px; border-radius:12px; font-style:italic; vertical-align: middle; box-shadow: 1px 1px 2px rgba(0,0,0,0.3); margin-left: 8px;">系统相识</span>` : '';

    const dateStr = `${targetDate.getFullYear()}.${String(targetDate.getMonth()+1).padStart(2,'0')}.${String(targetDate.getDate()).padStart(2,'0')}`;

    let textColor = finalBg ? '#fff' : 'var(--bg-color)';
    let textShadow = finalBg ? 'text-shadow: 1px 1px 3px rgba(0,0,0,0.8);' : '';

    card.innerHTML = `
        ${maskHtml}
        ${avatarHtml}
        ${delBtnHtml}
        <div style="position:absolute; bottom:0; left:0; right:0; padding:15px; display:flex; justify-content:space-between; align-items:flex-end; color:${textColor}; ${textShadow} pointer-events:none; z-index: 5;">
            <div style="display:flex; flex-direction:column; gap:6px;">
                <div style="font-weight:900; font-size:1.15em; display:flex; align-items:center;">${title} ${tagHtml}</div>
                <div style="font-size:0.8em; font-weight:bold; opacity:0.8; font-style:italic; font-family: monospace;">TARGET: ${dateStr}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:0.75em; font-weight:bold; opacity:0.8; margin-bottom:2px; font-style:italic;">${dayPrefix}</div>
                ${dayNumHtml}
            </div>
        </div>
    `;
    return card;
}

// 处理图片上传
window.handleAnniBgUpload = function(e) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        tempAnniBgData = event.target.result;
        const preview = document.getElementById('anniBgPreview');
        preview.style.backgroundImage = `url(${tempAnniBgData})`;
        preview.innerText = ''; // 隐藏文字
    };
    reader.readAsDataURL(file);
    e.target.value = ''; 
};

function openCreateAnniversaryModal() {
    tempAnniBgData = '';
    const preview = document.getElementById('anniBgPreview');
    preview.style.backgroundImage = 'none';
    preview.innerText = '+ 点击上传专属照片底图';
    
    document.getElementById('anniNameInput').value = '';
    const today = new Date();
    document.getElementById('anniDateInput').value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    
    document.getElementById('createAnniversaryModal').style.display = 'flex';
}

async function saveNewAnniversary() {
    const title = document.getElementById('anniNameInput').value.trim();
    const dateStr = document.getElementById('anniDateInput').value;
    
    if (!title || !dateStr) {
        showCustomConfirm('请输入名称和日期！', () => {});
        return;
    }
    
    const timestamp = new Date(dateStr).getTime();
    
    anniversaryDataList.push({
        title: title,
        timestamp: timestamp,
        bgUrl: tempAnniBgData, // 保存图片
        chatId: currentChatId
    });
    
    await putToDB('settings', { key: 'anniversaryData', value: anniversaryDataList });
    document.getElementById('createAnniversaryModal').style.display = 'none';
    renderAnniversaryList();
}

async function deleteAnniversary(index) {
    showCustomConfirm('确定要删除这个纪念日吗？', async () => {
        anniversaryDataList.splice(index, 1);
        await putToDB('settings', { key: 'anniversaryData', value: anniversaryDataList });
        renderAnniversaryList();
    });
}

/* ================= 记账与攒钱系统核心逻辑 ================= */
let billingDataList = [];
let savingDataList = [];

async function openBillingModal() {
    document.getElementById('appPanel').style.display = 'none';
    
    // 1. 先读数据
    const bData = await getFromDB('settings', 'billingData');
    billingDataList = bData ? bData.value : [];
    const sData = await getFromDB('settings', 'savingData');
    savingDataList = sData ? sData.value : [];
    
    // 2. 瞬间显示并排版
    document.getElementById('billingModal').style.display = 'flex';
    switchBillingTab('normal');
}

function switchBillingTab(tab) {
    document.getElementById('billTabNormal').classList.remove('active');
    document.getElementById('billTabSaving').classList.remove('active');
    document.getElementById('billContentNormal').style.display = 'none';
    document.getElementById('billContentSaving').style.display = 'none';
    
    if (tab === 'normal') {
        document.getElementById('billTabNormal').classList.add('active');
        document.getElementById('billContentNormal').style.display = 'flex';
        renderNormalBills();
    } else {
        document.getElementById('billTabSaving').classList.add('active');
        document.getElementById('billContentSaving').style.display = 'flex';
        renderSavingGoals();
    }
}

// ------ 日常记账模块 ------
function renderNormalBills() {
    const container = document.getElementById('normalBillListRender');
    container.innerHTML = '';
    const filter = document.getElementById('billTimeFilter').value;
    
    let totalIn = 0, totalOut = 0;
    const now = new Date();
    
    let filtered = billingDataList.filter(b => {
        const d = new Date(b.timestamp);
        if(filter === 'month' && (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear())) return false;
        if(filter === 'year' && d.getFullYear() !== now.getFullYear()) return false;
        return true;
    }).sort((a,b) => b.timestamp - a.timestamp);
    
    filtered.forEach(b => {
        if(b.type === 'in') totalIn += b.amount;
        else totalOut += b.amount;
        
        const div = document.createElement('div');
        div.style.cssText = "background:var(--panel-bg); border:3px solid var(--border-color); padding:12px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; box-shadow: 2px 2px 0 var(--border-color);";
        const isOut = b.type === 'out';
        div.innerHTML = `
            <div>
                <div style="font-weight:900; font-size:1.05em;">${b.note || (isOut ? '日常支出' : '日常收入')}</div>
                <div style="font-size:0.75em; opacity:0.7; margin-top:4px;">${new Date(b.timestamp).toLocaleString()}</div>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                <div style="font-weight:900; font-size:1.2em; color:${isOut ? '#ff4444' : '#4CAF50'}">${isOut ? '-' : '+'}${b.amount}</div>
                <button onclick="deleteBill('${b.id}')" style="background:transparent; border:none; color:#ff4444; cursor:pointer; font-weight:900; font-size:1.2em;">✖</button>
            </div>
        `;
        container.appendChild(div);
    });
    
    if(filtered.length === 0) container.innerHTML = '<div style="text-align:center; opacity:0.5; font-weight:900; padding:40px 0; font-style:italic;">暂无账单记录哦~</div>';
    
    document.getElementById('billTotalIn').innerText = totalIn.toFixed(2);
    document.getElementById('billTotalOut').innerText = totalOut.toFixed(2);
}

function openCreateBillModal() {
    document.getElementById('newBillAmount').value = '';
    document.getElementById('newBillNote').value = '';
    document.getElementById('createBillModal').style.display = 'flex';
}

async function saveNewBill() {
    const type = document.getElementById('newBillType').value;
    const amount = parseFloat(document.getElementById('newBillAmount').value);
    const note = document.getElementById('newBillNote').value.trim();
    
    if(!amount || amount <= 0) { showCustomConfirm('请输入正确的金额！', ()=>{}); return; }
    
    billingDataList.push({
        id: 'bill_' + Date.now(),
        type: type,
        amount: amount,
        note: note,
        timestamp: Date.now()
    });
    
    await putToDB('settings', { key: 'billingData', value: billingDataList });
    document.getElementById('createBillModal').style.display = 'none';
    renderNormalBills();
}

async function deleteBill(id) {
    showCustomConfirm('确定要删除这笔记录吗？', async () => {
        billingDataList = billingDataList.filter(b => b.id !== id);
        await putToDB('settings', { key: 'billingData', value: billingDataList });
        renderNormalBills();
    });
}

// ------ 攒钱目标模块 ------
function renderSavingGoals() {
    const container = document.getElementById('savingGoalListRender');
    container.innerHTML = '';
    if(savingDataList.length === 0) {
        container.innerHTML = '<div style="text-align:center; opacity:0.5; font-weight:900; padding:40px 0; font-style:italic;">还没有攒钱目标哦，建一个吧~</div>';
        return;
    }
    
    savingDataList.forEach(g => {
        const pct = Math.min(100, Math.round((g.current / g.target) * 100));
        const isCompleted = g.current >= g.target;
        
        const div = document.createElement('div');
        div.className = 'checkin-item'; // 完美复用打卡项UI的样式
        div.innerHTML = `
            <div class="checkin-header">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div class="checkin-title">${g.name}</div>
                    ${isCompleted ? '<span class="checkin-badge" style="background:#4CAF50; color:#fff; border-color:#4CAF50;">存满啦</span>' : '<span class="checkin-badge">存钱中</span>'}
                </div>
                <button onclick="deleteSaving('${g.id}')" style="background:transparent; border:none; color:#ff4444; font-weight:900; font-size:1.2em; cursor:pointer; padding:0; line-height:1;">✖</button>
            </div>
            
            <div class="checkin-progress-text">已攒: ${g.current} / ${g.target}</div>
            <div class="checkin-progress-bar">
                <div class="checkin-progress-fill" style="width: ${pct}%;"></div>
            </div>
            
            <div class="checkin-actions" style="margin-top:10px;">
                ${isCompleted ? '' : `<button class="action-btn" style="flex:1; padding:8px; border-radius:6px; margin:0;" onclick="openAddSavingModal('${g.id}')">往里存钱</button>`}
                <button class="outline-btn" style="flex:1; padding:8px; border-radius:6px; margin:0; border-style:dashed;" onclick="shareSaving('${g.id}')">分享卡片到聊天</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function openCreateSavingModal() {
    document.getElementById('newSavingName').value = '';
    document.getElementById('newSavingTarget').value = '';
    document.getElementById('createSavingModal').style.display = 'flex';
}

async function saveNewSaving() {
    const name = document.getElementById('newSavingName').value.trim();
    const target = parseFloat(document.getElementById('newSavingTarget').value);
    
    if(!name || !target || target <= 0) { showCustomConfirm('请完整输入目标和金额！', ()=>{}); return; }
    
    savingDataList.push({
        id: 'save_' + Date.now(),
        name: name,
        target: target,
        current: 0,
        timestamp: Date.now()
    });
    
    await putToDB('settings', { key: 'savingData', value: savingDataList });
    document.getElementById('createSavingModal').style.display = 'none';
    renderSavingGoals();
}

async function deleteSaving(id) {
    showCustomConfirm('确定要删除这个攒钱目标吗？', async () => {
        savingDataList = savingDataList.filter(s => s.id !== id);
        await putToDB('settings', { key: 'savingData', value: savingDataList });
        renderSavingGoals();
    });
}

function openAddSavingModal(id) {
    document.getElementById('currentSavingId').value = id;
    document.getElementById('addSavingAmount').value = '';
    document.getElementById('addSavingRecordModal').style.display = 'flex';
}

async function confirmAddSaving() {
    const id = document.getElementById('currentSavingId').value;
    const amount = parseFloat(document.getElementById('addSavingAmount').value);
    if(!amount || amount <= 0) { showCustomConfirm('请输入正确的存入金额！', ()=>{}); return; }
    
    const goal = savingDataList.find(s => s.id === id);
    if(goal) {
        goal.current += amount;
        // 把这笔存款顺便记入日常开销(当做支出去向)
        billingDataList.push({
            id: 'bill_' + Date.now(),
            type: 'out',
            amount: amount,
            note: '存入：' + goal.name,
            timestamp: Date.now()
        });
        await putToDB('settings', { key: 'savingData', value: savingDataList });
        await putToDB('settings', { key: 'billingData', value: billingDataList });
    }
    document.getElementById('addSavingRecordModal').style.display = 'none';
    renderSavingGoals();
}

// 核心：分享进度到聊天区
async function shareSaving(id) {
    const goal = savingDataList.find(g => g.id === id);
    if(!goal) return;
    
    // 收起账单面板
    document.getElementById('billingModal').style.display = 'none';
    
    let uAvatar = currentSettings.userAvatarUrl ? `background-image:url(${currentSettings.userAvatarUrl});color:transparent;` : '';
    let uChar = currentSettings.userAvatarUrl ? '' : (currentSettings.userName.charAt(0) || '我');
    let avatarsHtml = `<div class="checkin-avatar" style="${uAvatar}">${uChar}</div>`;
    
    const pct = Math.min(100, Math.round((goal.current / goal.target) * 100));
    const isCompleted = goal.current >= goal.target;
    let statusText = isCompleted ? '目标已达成，太棒啦！' : '正在努力攒钱中...';

    const htmlStr = `
        <div class="checkin-chat-card">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 2px;">
                <div style="font-weight:900; font-size:1.15em; letter-spacing:1px; line-height:1.3; max-width: 65%;">
                    <span style="font-size:0.7em; background:var(--text-color); color:var(--bg-color); padding:2px 4px; border-radius:4px; vertical-align:middle; margin-right:4px;">攒钱记录</span>
                    <br/>${goal.name}
                </div>
                <div class="checkin-avatars" style="margin-bottom:0; flex-shrink: 0;">${avatarsHtml}</div>
            </div>
            <div style="font-size:0.85em; font-weight:900; font-style:italic; margin-top:4px;">${statusText}</div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                <div style="font-size:0.8em; font-weight:900; font-style:italic;">我的进度</div>
                <div class="checkin-progress-text">${goal.current} / ${goal.target}</div>
            </div>
            <div class="checkin-progress-bar" style="margin-bottom:0; height:8px;">
                <div class="checkin-progress-fill" style="width: ${pct}%;"></div>
            </div>
        </div>
    `;
    
    const qData = currentQuoteData; clearQuote();
    await saveAndRenderMsg('user', htmlStr, null, Date.now(), true, null, qData);
    if (!isBatchMode) simulateReadAndReply();
}

/* ================= 美化商城系统核心逻辑 ================= */
function openThemeStoreModal() {
    // 隐藏主菜单面板
    document.getElementById('appPanel').style.display = 'none';
    // 打开美化商城弹窗
    document.getElementById('themeStoreModal').style.display = 'flex';
    // 默认展示“顶栏排版”模块
    switchThemeStoreTab('header');
}

function closeThemeStoreModal() {
    document.getElementById('themeStoreModal').style.display = 'none';
}

function switchThemeStoreTab(tab) {
    // 移除所有的高亮
    document.getElementById('tsTabHeader').classList.remove('active');
    document.getElementById('tsTabTheme').classList.remove('active');
    document.getElementById('tsTabBubble').classList.remove('active');
    document.getElementById('tsTabInput').classList.remove('active');
    
    // 隐藏所有的内容区
    document.getElementById('tsContentHeader').style.display = 'none';
    document.getElementById('tsContentTheme').style.display = 'none';
    document.getElementById('tsContentBubble').style.display = 'none';
    document.getElementById('tsContentInput').style.display = 'none';
    
    // 根据点击点亮对应的Tab并显示内容
    if (tab === 'header') {
        document.getElementById('tsTabHeader').classList.add('active');
        document.getElementById('tsContentHeader').style.display = 'flex';
    } else if (tab === 'theme') {
        document.getElementById('tsTabTheme').classList.add('active');
        document.getElementById('tsContentTheme').style.display = 'flex';
    } else if (tab === 'bubble') {
        document.getElementById('tsTabBubble').classList.add('active');
        document.getElementById('tsContentBubble').style.display = 'flex';
    } else if (tab === 'input') {
        document.getElementById('tsTabInput').classList.add('active');
        document.getElementById('tsContentInput').style.display = 'flex';
    }
}

window.applyThemeStyle = async function(styleId) {
    currentSettings.themeStyle = styleId;
    await putToDB('settings', { key: 'config', value: currentSettings });
    
    // 调用更新样式
    applyAppearance();
    
    // ⬇️ 新增这两行：让切换主题时立刻重绘全部聊天记录，不再需要重启！
    renderMessagesList(allMessagesCache.slice(-messageOffset));
    updateAvatarPreview();
    
    // 👉 这里补上刷新顶栏排版的代码！
    renderHeaderLayout(); 
    
    // 弹窗提示
    let t = document.createElement('div');
    t.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:var(--text-color); color:var(--bg-color); padding:15px 25px; border-radius:8px; font-weight:900; font-size:1.1em; z-index:999999; box-shadow: 4px 4px 0 var(--border-color); opacity:0; transition:opacity 0.2s;';
    if (styleId === 'wechat') t.innerText = '已套用微信主题';
else if (styleId === 'imessage') t.innerText = '已套用苹果主题';
else if (styleId === 'pink') t.innerText = '已套用粉色少女主题';
else if (styleId === 'glass') t.innerText = '已套用全透毛玻璃主题';
else if (styleId === 'magazine') t.innerText = '已套用杂志线框主题';
else if (styleId === 'journal') t.innerText = '已套用温暖手账主题'; // 👉 加这行
else t.innerText = '已恢复默认主题';
    document.body.appendChild(t);
    setTimeout(() => t.style.opacity = '1', 10);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 1500);
}

// --- 顶栏排版系统引擎 ---
async function applyHeaderStyle(styleId) {
    currentSettings.headerStyle = styleId;
    await putToDB('settings', { key: 'config', value: currentSettings });
    renderHeaderLayout();
    
    // 弹窗提示
let t = document.createElement('div');
t.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:var(--text-color); color:var(--bg-color); padding:15px 25px; border-radius:8px; font-weight:900; font-size:1.1em; z-index:999999; box-shadow: 4px 4px 0 var(--border-color); opacity:0; transition:opacity 0.2s;';
t.innerText = '顶栏排版已应用';
document.body.appendChild(t);
setTimeout(() => t.style.opacity = '1', 10);
setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 1500);
}

function renderHeaderLayout() {
    const headerCenter = document.querySelector('.header-center-box');
    if (!headerCenter) return;
    
    const charName = currentSettings.charName || "TA";
    const userName = currentSettings.userName || "我";
    // 每次重绘顶栏前，先清空特殊排版标记
document.body.classList.remove('giant_floating_island');
    
    // 杂志主题排版：左侧超大名字，右侧微型文字导航
if (currentSettings.themeStyle === 'magazine') {
    const themeBtn = document.getElementById('themeToggleBtn');
    const headerObj = document.querySelector('.header');
    const headerActions = document.querySelector('.header-actions');
    
    // 把主题切换按钮塞进右侧功能区里
    if (themeBtn && headerActions) headerActions.insertBefore(themeBtn, headerActions.firstChild);
    
    // 名字靠左，并且变大
    headerCenter.style.cssText = 'display:flex; flex-direction:column; justify-content:center; align-items:flex-start; background:transparent !important; border:none !important; box-shadow:none !important; padding:0 !important; margin:0 !important; flex:1; transform:none !important;';
    
    headerCenter.innerHTML = `<div class="header-title" style="font-weight:900 !important; font-size:24px !important; letter-spacing: 2px !important; font-family: 'Times New Roman', 'Songti SC', SimSun, serif !important; color:var(--border-color) !important; text-transform: uppercase;">${charName}</div>`;
    return;
}

    // 微信主题排版：绝对居中，且完全无头像！
    if (currentSettings.themeStyle === 'wechat') {
        const themeBtn = document.getElementById('themeToggleBtn');
        const headerObj = document.querySelector('.header');
        if (themeBtn && headerObj) headerObj.insertBefore(themeBtn, headerCenter);
        
        headerCenter.style.cssText = 'position:absolute !important; left:50% !important; top:50% !important; transform:translate(-50%, -50%) !important; background:transparent !important; border:none !important; box-shadow:none !important; padding:0 !important; margin:0 !important; height:auto !important; z-index:1 !important; display:flex !important; flex-direction:column !important; align-items:center !important; justify-content:center !important; overflow:visible !important;';
        
        headerCenter.innerHTML = `<div class="header-title" style="font-weight:500 !important; font-size:17px !important; color:var(--text-color) !important; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${charName}</div>`;
        return;
    } 
    // iMessage 主题排版：小头像 + 名字居中
    else if (currentSettings.themeStyle === 'imessage') {
        const themeBtn = document.getElementById('themeToggleBtn');
        const headerObj = document.querySelector('.header');
        if (themeBtn && headerObj) headerObj.insertBefore(themeBtn, headerCenter);
        
        let cAvatar = currentSettings.avatarUrl ? `background-image:url(${currentSettings.avatarUrl}); color:transparent;` : '';
        let cChar = currentSettings.avatarUrl ? '' : charName.charAt(0);
        
        headerCenter.style.cssText = 'position:absolute !important; left:50% !important; top:50% !important; transform:translate(-50%, -50%) !important; background:transparent !important; border:none !important; box-shadow:none !important; padding:0 !important; margin:0 !important; height:auto !important; z-index:1 !important; display:flex !important; flex-direction:column !important; align-items:center !important; justify-content:center !important; overflow:visible !important;';
        
        headerCenter.innerHTML = `
            <div style="width:40px; height:40px; border-radius:50%; background-color:#e5e5ea; ${cAvatar} background-size:cover; background-position:center; display:flex; justify-content:center; align-items:center; font-size:16px; font-weight:900; margin-bottom:2px; color:var(--text-color);">${cChar}</div>
            <div class="header-title" style="font-weight:500 !important; font-size:11px !important; color:var(--text-color) !important; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:2px;">
                ${charName} <span style="font-size:10px; opacity:0.3; transform:scale(0.8);">></span>
            </div>
        `;
        return;
    }
    
    // 如果是漫画风默认主题，走默认排版...
    const styleId = currentSettings.headerStyle || 'default';
    const themeBtn = document.getElementById('themeToggleBtn');
    const headerObj = document.querySelector('.header');
    const headerActions = document.querySelector('.header-actions');
    
    if (themeBtn && headerObj && headerActions) {
        if (styleId === 'minimalist_left') {
            headerActions.insertBefore(themeBtn, headerActions.firstChild);
        } else {
            headerObj.insertBefore(themeBtn, headerCenter);
        }
    }
    
    if (styleId === 'duo_bubble') {
        let cAvatar = currentSettings.avatarUrl ? `background-image:url(${currentSettings.avatarUrl}); color:transparent;` : '';
        let uAvatar = currentSettings.userAvatarUrl ? `background-image:url(${currentSettings.userAvatarUrl}); color:transparent;` : '';
        let cChar = currentSettings.avatarUrl ? '' : charName.charAt(0);
        let uChar = currentSettings.userAvatarUrl ? '' : userName.charAt(0);
        
        headerCenter.style.cssText = 'position:relative; display:block; flex:1; background:transparent; border:none; box-shadow:none; padding:0; transform:none; margin:0 8px; height:36px; overflow:visible !important; z-index:99;';
        headerCenter.innerHTML = `
            <style>
                .header { position: absolute !important; top: 0 !important; left: 0 !important; right: 0 !important; z-index: 100 !important; background: transparent !important; pointer-events: none !important; border: none !important; }
                .header-actions, #themeToggleBtn { pointer-events: auto !important; }
                #chatContainer { padding-top: 100px !important; }
            </style>
            <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); display:flex; justify-content:center; align-items:center; width:100%; height:0; overflow:visible; pointer-events: auto;">
                <div style="position:relative; display:flex; z-index:2; align-items:center;">
                    <div style="width:56px; height:56px; border-radius:50%; border:3px solid var(--border-color); background-color:var(--bg-color); ${cAvatar} background-size:cover; background-position:center; display:flex; justify-content:center; align-items:center; font-size:18px; font-weight:900; z-index:2; box-shadow:2px 2px 0 var(--border-color);">${cChar}</div>
                    <div style="width:46px; height:46px; border-radius:50%; border:3px solid var(--border-color); background-color:var(--bg-color); ${uAvatar} background-size:cover; background-position:center; display:flex; justify-content:center; align-items:center; font-size:14px; font-weight:900; margin-left:-18px; z-index:1; box-shadow:2px 2px 0 var(--border-color);">${uChar}</div>
                    <div style="position:absolute; bottom:38px; left:66px; transform:translateX(-50%); background:var(--panel-bg); border:2px solid var(--border-color); border-radius:8px; padding:2px 10px; font-weight:900; font-size:0.75em; box-shadow:2px 2px 0 var(--border-color); z-index:3;">
                        <span style="position:relative; z-index:2; max-width:80px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${userName}</span>
                        <div style="position:absolute; bottom:-5px; left:50%; transform:translateX(-50%) rotate(45deg); width:6px; height:6px; background:var(--panel-bg); border-bottom:2px solid var(--border-color); border-right:2px solid var(--border-color);"></div>
                    </div>
                    <div style="position:absolute; top:45px; left:28px; transform:translateX(-50%); background:var(--panel-bg); border:2px solid var(--border-color); border-radius:8px; padding:2px 12px; font-weight:900; font-size:0.9em; box-shadow:2px 2px 0 var(--border-color); z-index:3;">
                        <div style="position:absolute; top:-4px; left:50%; transform:translateX(-50%) rotate(45deg); width:6px; height:6px; background:var(--panel-bg); border-top:2px solid var(--border-color); border-left:2px solid var(--border-color);"></div>
                        <span style="position:relative; z-index:2; max-width:100px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${charName}</span>
                    </div>
                </div>
            </div>
        `;
    } else if (styleId === 'giant_floating_island') {
    document.body.classList.add('giant_floating_island');
        let cAvatar = currentSettings.avatarUrl ? `background-image:url(${currentSettings.avatarUrl}); color:transparent;` : '';
        let uAvatar = currentSettings.userAvatarUrl ? `background-image:url(${currentSettings.userAvatarUrl}); color:transparent;` : '';
        let cChar = currentSettings.avatarUrl ? '' : charName.charAt(0);
        let uChar = currentSettings.userAvatarUrl ? '' : userName.charAt(0);
        let radiusStyle = currentSettings.avatarShape === 'circle' ? '50%' : '6px';
        
        headerCenter.style.cssText = 'position:relative; display:flex; flex:1; justify-content:center; align-items:center; background:transparent; border:none; box-shadow:none; padding:0; transform:none; margin:0; height:auto; overflow:visible !important; z-index:99;';
        
        headerCenter.innerHTML = `
            <style>
                /* 彻底隐藏外面乱跑的原生按钮 */
                .header-actions, #themeToggleBtn { display: none !important; }
                
                /* 👇 1. 让顶栏变成真正的“绝对悬浮”，脱离文档流，不切断底下的聊天区 */
                .header { 
                    position: absolute !important; 
                    top: 0 !important; left: 0 !important; right: 0 !important;
                    padding: 12px 15px !important; 
                    display: block !important; 
                    height: auto !important; 
                    z-index: 100 !important;
                    background: transparent !important;
                    pointer-events: none !important; /* 🌟关键：让周围的透明区域允许手指滑动穿透 */
                }

                /* 👇 2. 魔改：将音乐播放器塞入中间区域，并悬挂列表面板 */
                #chatContainer {
                    padding-top: 180px !important; 
                }
                #topMusicPlayerBox {
                    padding-top: 0 !important;
                    top: 65px !important; /* 调整高度，刚好在签名下方 */
                    left: 50% !important;
                    transform: translateX(-50%) !important;
                    width: 175px !important; /* 宽度刚好塞进两头像中间的空隙 */
                    z-index: 105 !important;
                }

                /* 缩小胶囊播放器，适应狭小空间 */
                #topMusicPlayerBox .music-pill-box {
                    height: 32px !important;
                    padding: 2px 6px 2px 8px !important;
                    background: var(--bg-color) !important;
                    border: 2px solid var(--border-color) !important;
                    box-shadow: 2px 2px 0 var(--border-color) !important;
                }
                #topMusicPlayerBox .music-note-icon { display: none !important; } /* 隐藏转圈图标省空间 */
                #topMusicPlayerBox .music-scroll-title { font-size: 0.75em !important; margin-right: 4px !important;}
                #topMusicPlayerBox .music-pill-ctrl { gap: 2px !important; }
                #topMusicPlayerBox .music-pill-ctrl .icon-btn { width: 22px !important; height: 22px !important; border-width: 1.5px !important; box-shadow: 1px 1px 0 var(--border-color) !important; }
                #topMusicPlayerBox .music-pill-ctrl .icon-btn svg { width: 12px !important; height: 12px !important; }
                #topMusicPlayerBox #musicCardMode { display: none !important; } /* 空间不够，屏蔽大卡片模式 */

                /* 展开的列表面板：悬浮在大框框下方 */
                #topMusicPlayerBox .music-list-panel {
                    position: fixed !important;
                    top: 130px !important; /* 高度刚好在大面板的下面一点点 */
                    left: 50% !important;
                    transform: translateX(-50%) !important;
                    width: calc(100vw - 30px) !important;
max-width: none !important;
                    border-radius: 12px !important;
                    border-top: 3px solid var(--border-color) !important;
                    margin: 0 !important;
                    box-shadow: 6px 6px 0 var(--border-color) !important;
                    background: var(--panel-bg) !important;
                    z-index: 99 !important;
                }
                
                /* 👇 3. 恢复悬浮大框框本身的实体点击，确保上面的按钮还能按 */
                .header-center-box {
                    pointer-events: auto !important; 
                    width: 100% !important;
                    max-width: 100% !important;
                    margin: 0 !important;
                    padding: 18px 10px !important; 
                    background: var(--panel-bg) !important;
                    border: 4px solid var(--border-color) !important;
                    border-radius: 24px !important;
                    box-shadow: 6px 6px 0 var(--border-color) !important;
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 15px !important; 
                    transform: none !important;
                }

                .board-btn {
                    width: 24px; height: 24px;
                    border-radius: 8px;
                    border: none;
                    background: transparent;
                    color: var(--text-color);
                    display: flex; justify-content: center; align-items: center;
                    box-shadow: none !important; 
                    cursor: pointer;
                    transition: 0.15s;
                }
                .board-btn:active { transform: scale(0.85); opacity: 0.5; }
                .board-btn svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }

                /* 🌟 神仙交互：让 div 拥有真正的 Placeholder 效果，不用手动删字了 */
                .custom-island-text:empty::before {
                    content: '点击写下专属签名...';
                    opacity: 0.5;
                    pointer-events: none;
                }
            </style>

<!-- 第一层：头像彻底分开，中间加入真正的占位符文字，并且靠上对齐 -->
            <div style="display: flex; justify-content: space-between; align-items: stretch; width: 100%;">
                
                <!-- 对方 -->
                <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; flex-shrink: 0;">
                    <div style="width: 60px; height: 60px; border-radius: ${radiusStyle}; border: 3px solid var(--border-color); background-color: var(--bg-color); ${cAvatar} background-size: cover; background-position: center; display: flex; justify-content: center; align-items: center; font-size: 22px; font-weight: 900;">${cChar}</div>
                    <div style="font-weight: 900; font-size: 14px; max-width: 80px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center;">${charName}</div>
                </div>

                <!-- 中间区域：位置靠上 -->
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; margin: 0 10px; min-width: 0; padding-top: 6px;">
                    <div class="custom-island-text" contenteditable="true" spellcheck="false" onblur="currentSettings.islandCustomText=this.innerText; putToDB('settings', { key: 'config', value: currentSettings })" style="font-weight: 900; font-size: 13px; color: var(--text-color); opacity: 0.7; text-align: center; outline: none; font-style: italic; letter-spacing: 1px; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 4px; border-bottom: 2px dashed transparent; transition: 0.2s;" onfocus="this.style.borderBottom='2px dashed var(--text-color)'" onmouseout="this.style.borderBottom='2px dashed transparent'">${currentSettings.islandCustomText || ''}</div>
                </div>

                <!-- 自己 -->
                <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; flex-shrink: 0;">
                    <div style="width: 60px; height: 60px; border-radius: ${radiusStyle}; border: 3px solid var(--border-color); background-color: var(--bg-color); ${uAvatar} background-size: cover; background-position: center; display: flex; justify-content: center; align-items: center; font-size: 22px; font-weight: 900;">${uChar}</div>
                    <div style="font-weight: 900; font-size: 14px; max-width: 80px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center;">${userName}</div>
                </div>
            </div>
            
            <!-- 第二层：5个SVG图标 -->
            <div style="display: flex; justify-content: center; gap: 20px; width: 100%;">
                <div class="board-btn" onclick="toggleTheme()" title="切换日月"><svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg></div>
                <div class="board-btn" onclick="openGroupModal()" title="群聊"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></div>
                <div class="board-btn" onclick="startPhoneCall()" title="电话"><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg></div>
                <div class="board-btn" onclick="openCardsModal()" title="字卡"><svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg></div>
                <div class="board-btn" onclick="openSettings()" title="设置"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></div>
            </div>
        `;
    } else if (styleId === 'avatar_left') {
        let cAvatar = currentSettings.avatarUrl ? `background-image:url(${currentSettings.avatarUrl}); color:transparent;` : '';
        let cChar = currentSettings.avatarUrl ? '' : charName.charAt(0);
        let radiusStyle = currentSettings.avatarShape === 'circle' ? '50%' : '6px';
        
        headerCenter.style.cssText = 'display:flex; flex-direction:row; align-items:center; justify-content:center; background:var(--panel-bg); border:3px solid var(--border-color); padding:4px 15px 4px 6px; box-shadow:4px 4px 0 var(--border-color); border-radius:30px; flex:1; flex-shrink:1; min-width:0; overflow:hidden; margin:0 8px; gap:8px; height: 40px;';
        headerCenter.innerHTML = `
            <div style="width:26px; height:26px; border-radius:${radiusStyle}; border:2px solid var(--border-color); background-color:var(--bg-color); ${cAvatar} background-size:cover; background-position:center; display:flex; justify-content:center; align-items:center; font-size:12px; font-weight:900; flex-shrink:0;">${cChar}</div>
            <div style="display:flex; flex-direction:column; align-items:flex-start; justify-content:center; overflow:hidden;">
                <div style="font-weight:900; font-size:1.1em; line-height:1.1; max-width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${charName}</div>
                <div style="font-size:0.6em; font-weight:bold; font-style:italic; opacity:0.8; line-height:1; margin-top:2px;">ONLINE</div>
            </div>
        `;
    } else if (styleId === 'minimalist_left') {
        let cAvatar = currentSettings.avatarUrl ? `background-image:url(${currentSettings.avatarUrl}); color:transparent;` : '';
        let cChar = currentSettings.avatarUrl ? '' : charName.charAt(0);
        let radiusStyle = currentSettings.avatarShape === 'circle' ? '50%' : '6px';
        
        headerCenter.style.cssText = 'display:flex; flex-direction:row; align-items:center; justify-content:flex-start; background:transparent; border:none; box-shadow:none; padding:0; margin:0; flex:1; flex-shrink:1; min-width:0; overflow:visible !important; gap:10px; height: 36px; transform:none; z-index:99;';
        headerCenter.innerHTML = `
            <div style="width:44px; height:44px; border-radius:${radiusStyle}; border:3px solid var(--border-color); background-color:var(--bg-color); ${cAvatar} background-size:cover; background-position:center; display:flex; justify-content:center; align-items:center; font-size:16px; font-weight:900; flex-shrink:0; position:relative;">${cChar}</div>
            <div style="font-weight:900; font-size:1.4em; line-height:1.1; max-width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${charName}</div>
        `;
    } else {
        headerCenter.style.cssText = 'display:flex; flex-direction:column; align-items:center; justify-content:center; background:var(--panel-bg); border:3px solid var(--border-color); padding:5px 15px; box-shadow:4px 4px 0 var(--border-color); transform:rotate(-1deg); border-radius:4px; flex:1; flex-shrink:1; min-width:0; overflow:hidden; margin:0 8px;';
        headerCenter.innerHTML = `
            <div class="header-title" id="yumeTitle" style="max-width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${charName}</div>
            <div class="header-sub">ONLINE</div>
        `;
    }
}

window.applyBubbleStyle = async function(styleId) {
    // 终极绝杀：带上 #chatContainer 的最高权限，直接碾压任何主题的颜色和小尾巴
    const killThemeTail = `
        #chatContainer .yume .bubble::before, #chatContainer .yume .bubble::after,
        #chatContainer .user .bubble::before, #chatContainer .user .bubble::after {
            display: none !important; content: none !important; box-shadow: none !important; border: none !important; background: transparent !important;
        }
    `;

    let css = '';
    switch(styleId) {
        case 'tape':
            css = killThemeTail + `
                #chatContainer .bubble { border: none !important; border-radius: 2px !important; box-shadow: 2px 3px 6px rgba(0,0,0,0.1) !important; position: relative !important; overflow: visible !important; }
                #chatContainer .bubble::before { content: '' !important; display: block !important; position: absolute !important; top: -5px !important; left: 50% !important; transform: translateX(-50%) rotate(-2deg) !important; width: 40px !important; height: 12px !important; background: rgba(255,255,255,0.6) !important; border: 1px solid rgba(0,0,0,0.1) !important; z-index: 1 !important; box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important; }
                [data-theme="dark"] #chatContainer .bubble::before { background: rgba(255,255,255,0.2) !important; border-color: rgba(255,255,255,0.1) !important; }
                #chatContainer .yume .bubble { background: #fdf5e6 !important; color: #333 !important; }
                #chatContainer .user .bubble { background: #e6f2fd !important; color: #333 !important; }
                [data-theme="dark"] #chatContainer .yume .bubble { background: #3a3226 !important; color: #eee !important; }
                [data-theme="dark"] #chatContainer .user .bubble { background: #26333a !important; color: #eee !important; }
            `;
            break;
        case 'glass':
            css = killThemeTail + `
                #chatContainer .bubble { border: 1px solid rgba(255,255,255,0.4) !important; border-radius: 12px !important; backdrop-filter: blur(10px) !important; -webkit-backdrop-filter: blur(10px) !important; box-shadow: 0 4px 15px rgba(0,0,0,0.05) !important; }
                #chatContainer .yume .bubble { background: rgba(255, 255, 255, 0.65) !important; color: #333 !important; }
                #chatContainer .user .bubble { background: rgba(240, 248, 255, 0.65) !important; color: #333 !important; }
                [data-theme="dark"] #chatContainer .yume .bubble { background: rgba(50, 50, 50, 0.6) !important; color: #eee !important; border-color: rgba(255,255,255,0.1) !important;}
                [data-theme="dark"] #chatContainer .user .bubble { background: rgba(60, 70, 80, 0.6) !important; color: #eee !important; border-color: rgba(255,255,255,0.1) !important;}
            `;
            break;
        case 'jelly':
            css = killThemeTail + `
                #chatContainer .bubble { border: none !important; border-radius: 20px !important; box-shadow: inset 0 4px 6px rgba(255,255,255,0.7), 0 4px 8px rgba(0,0,0,0.06) !important; font-weight: bold !important; }
                #chatContainer .yume .bubble { background: linear-gradient(135deg, #fffafa, #f2f2f2) !important; color: #444 !important; }
                #chatContainer .user .bubble { background: linear-gradient(135deg, #e0f7fa, #d1eff5) !important; color: #333 !important; }
                [data-theme="dark"] #chatContainer .bubble { box-shadow: inset 0 2px 4px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.3) !important; }
                [data-theme="dark"] #chatContainer .yume .bubble { background: linear-gradient(135deg, #444, #333) !important; color: #ddd !important; }
                [data-theme="dark"] #chatContainer .user .bubble { background: linear-gradient(135deg, #2b454c, #1a2f35) !important; color: #eee !important; }
            `;
            break;
        case 'minimalist':
            css = killThemeTail + `
                #chatContainer .bubble { border: none !important; border-radius: 12px !important; box-shadow: 0 4px 10px rgba(0,0,0,0.1) !important; }
                #chatContainer .yume .bubble { background: #fff !important; color: #111 !important; }
                #chatContainer .user .bubble { background: #111 !important; color: #fff !important; }
                [data-theme="dark"] #chatContainer .yume .bubble { background: #222 !important; color: #ddd !important; }
                [data-theme="dark"] #chatContainer .user .bubble { background: #ddd !important; color: #111 !important; }
            `;
            break;
        case 'outline':
            css = killThemeTail + `
                #chatContainer .bubble { background: transparent !important; border: 2px solid #333 !important; border-radius: 16px !important; box-shadow: 3px 3px 0 rgba(0,0,0,0.05) !important; font-weight: 900 !important; }
                #chatContainer .yume .bubble { color: #555 !important; border-color: #aaa !important; }
                #chatContainer .user .bubble { color: #333 !important; border-color: #333 !important; }
                [data-theme="dark"] #chatContainer .bubble { box-shadow: 3px 3px 0 rgba(255,255,255,0.05) !important; }
                [data-theme="dark"] #chatContainer .yume .bubble { color: #aaa !important; border-color: #666 !important; }
                [data-theme="dark"] #chatContainer .user .bubble { color: #eee !important; border-color: #eee !important; }
            `;
            break;
        case 'macaron':
            css = killThemeTail + `
                #chatContainer .bubble { border: none !important; border-radius: 18px !important; box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important; color: #555 !important; }
                #chatContainer .yume .bubble { background: linear-gradient(120deg, #fdfbfb 0%, #ebedee 100%) !important; }
                #chatContainer .user .bubble { background: linear-gradient(120deg, #ffd194 0%, #70e1f5 100%) !important; }
                [data-theme="dark"] #chatContainer .bubble { color: #eee !important; }
                [data-theme="dark"] #chatContainer .yume .bubble { background: linear-gradient(120deg, #434343 0%, #282828 100%) !important; }
                [data-theme="dark"] #chatContainer .user .bubble { background: linear-gradient(120deg, #b06ab3 0%, #4568dc 100%) !important; }
            `;
            break;
        case 'cloud':
            css = killThemeTail + `
                #chatContainer .bubble { border: 3px solid #000 !important; border-radius: 24px !important; box-shadow: 4px 4px 0 #000 !important; font-weight: 900 !important; padding: 12px 18px !important; }
                #chatContainer .yume .bubble { background: #fff !important; color: #000 !important; }
                #chatContainer .user .bubble { background: #ffeb3b !important; color: #000 !important; }
                [data-theme="dark"] #chatContainer .bubble { border: 3px solid #444 !important; box-shadow: 4px 4px 0 #444 !important; }
                [data-theme="dark"] #chatContainer .yume .bubble { background: #222 !important; color: #eee !important; }
                [data-theme="dark"] #chatContainer .user .bubble { background: #7a6e1a !important; color: #eee !important; }
            `;
            break;
        case 'fluid':
            css = killThemeTail + `
                #chatContainer .bubble { border: none !important; box-shadow: 2px 4px 10px rgba(0,0,0,0.06) !important; padding: 12px 18px !important; }
                #chatContainer .yume .bubble { background: #e0eaf5 !important; color: #4a6fa5 !important; border-radius: 30% 60% 40% 50% / 50% 30% 60% 40% !important; }
                #chatContainer .user .bubble { background: #fcd5ce !important; color: #a25c68 !important; border-radius: 50% 40% 60% 30% / 40% 50% 30% 60% !important; }
                [data-theme="dark"] #chatContainer .bubble { box-shadow: 0 4px 10px rgba(0,0,0,0.4) !important; }
                [data-theme="dark"] #chatContainer .yume .bubble { background: #2c3a4f !important; color: #a8c1e8 !important; }
                [data-theme="dark"] #chatContainer .user .bubble { background: #5a383f !important; color: #f4c0c8 !important; }
            `;
            break;
        case 'torn':
            css = killThemeTail + `
                #chatContainer .bubble { border: none !important; border-radius: 2px !important; font-weight: 900 !important; filter: drop-shadow(2px 3px 2px rgba(0,0,0,0.08)) !important; }
                #chatContainer .yume .bubble { background: #fdfaf6 !important; color: #5c4a45 !important; clip-path: polygon(1% 2%, 99% 0%, 97% 96%, 3% 100%) !important; transform: rotate(1deg) !important; }
                #chatContainer .user .bubble { background: #f4e8c1 !important; color: #5c4a45 !important; clip-path: polygon(0% 4%, 100% 0%, 98% 95%, 2% 100%) !important; transform: rotate(-1deg) !important; }
                [data-theme="dark"] #chatContainer .yume .bubble { background: #332f2c !important; color: #dfd1c5 !important; }
                [data-theme="dark"] #chatContainer .user .bubble { background: #403621 !important; color: #e6dac3 !important; }
            `;
            break;
        case 'aurora':
            css = killThemeTail + `
                #chatContainer .bubble { border: none !important; font-weight: 900 !important; }
                #chatContainer .yume .bubble { background: linear-gradient(120deg, #e0c3fc 0%, #8ec5fc 100%) !important; color: #fff !important; border-radius: 12px 12px 12px 2px !important; box-shadow: 0 4px 15px rgba(142,197,252,0.25) !important; }
                #chatContainer .user .bubble { background: linear-gradient(45deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%) !important; color: #555 !important; border-radius: 12px 12px 2px 12px !important; box-shadow: 0 4px 15px rgba(255,154,158,0.25) !important; }
                [data-theme="dark"] #chatContainer .yume .bubble { background: linear-gradient(120deg, #4b3668 0%, #2f4b68 100%) !important; color: #e0e0e0 !important; box-shadow: 0 4px 15px rgba(0,0,0,0.4) !important;}
                [data-theme="dark"] #chatContainer .user .bubble { background: linear-gradient(45deg, #683033 0%, #634057 100%) !important; color: #e0e0e0 !important; box-shadow: 0 4px 15px rgba(0,0,0,0.4) !important;}
            `;
            break;
        default:
            css = ''; // 为空即自动退位，恢复原主题的气泡样式
    }
    
    currentSettings.bubblePresetCss = css;
    await putToDB('settings', { key: 'config', value: currentSettings });
    
    // 把新样式塞进去并重新刷一遍整个界面
    document.getElementById('customBubbleCss').innerHTML = currentSettings.bubbleCss ? currentSettings.bubbleCss : '';
    if (currentSettings.bubblePresetCss) {
        document.getElementById('customBubbleCss').innerHTML += `\n${currentSettings.bubblePresetCss}`;
    }
    
    // 让切换主题时立刻重绘全部聊天记录
    renderMessagesList(allMessagesCache.slice(-messageOffset));
    updateAvatarPreview();
    
    let t = document.createElement('div');
    t.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:var(--text-color); color:var(--bg-color); padding:15px 25px; border-radius:8px; font-weight:900; font-size:1.1em; z-index:999999; box-shadow: 4px 4px 0 var(--border-color); opacity:0; transition:opacity 0.2s;';
    t.innerText = styleId === 'default' ? '已恢复主题默认气泡' : '已强力替换气泡样式';
    document.body.appendChild(t);
    setTimeout(() => t.style.opacity = '1', 10);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 1500);
}

window.applyInputStyle = async function(styleId) {
    let css = '';
    switch(styleId) {
        case 'floating_pill':
            css = `
                #chatContainer { padding-bottom: 90px !important; }
                #chatContainer ~ .input-wrapper .input-top-tag { display: none !important; }
                #chatContainer ~ .input-wrapper { position: absolute !important; bottom: 0 !important; left: 0 !important; right: 0 !important; pointer-events: none !important; z-index: 100 !important; padding: 10px 15px 20px 15px !important; background: transparent !important; border-top: none !important; }
                #chatContainer ~ .input-wrapper .input-area { pointer-events: auto !important; background: var(--panel-bg) !important; border: 3px solid var(--border-color) !important; border-radius: 30px !important; padding: 6px 8px 6px 12px !important; box-shadow: 0 8px 20px rgba(0,0,0,0.1), 0 4px 0 var(--border-color) !important; display: flex !important; align-items: center !important; gap: 8px !important; width: 100% !important; }
                #chatContainer ~ .input-wrapper .tool-btns { display: flex !important; gap: 4px !important; padding-left: 0 !important; }
                #chatContainer ~ .input-wrapper .tool-icon-btn { border: none !important; background: transparent !important; box-shadow: none !important; width: 32px !important; height: 32px !important; padding: 4px !important; color: var(--text-color) !important; border-radius: 50% !important; }
                #chatContainer ~ .input-wrapper .input-box { flex: 1 !important; border: none !important; padding: 0 4px !important; }
                #chatContainer ~ .input-wrapper .main-input { font-size: 1.05em !important; padding: 6px 0 !important; }
                #chatContainer ~ .input-wrapper .send-btn { border-radius: 50% !important; width: 38px !important; height: 38px !important; min-width: 38px !important; padding: 0 !important; display: flex !important; justify-content: center !important; align-items: center !important; flex-shrink: 0 !important; font-size: 0 !important; box-shadow: none !important; margin: 0 !important; border-width: 2px !important; }
                #chatContainer ~ .input-wrapper .send-btn::after { content: ''; display: block; width: 20px; height: 20px; background-color: var(--bg-color); -webkit-mask: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>') no-repeat center / contain; mask: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>') no-repeat center / contain; }
            `;
            break;
            
        case 'cyber_block':
            // 硬核机甲方块：黑边、方直角、重阴影，顶部标签倾斜设计
            css = `
                #chatContainer ~ .input-wrapper .input-top-tag {
                    background: var(--text-color) !important; color: var(--bg-color) !important;
                    border: 3px solid var(--border-color) !important; border-bottom: none !important;
                    border-radius: 0 !important; font-family: monospace !important; 
                    transform: skewX(-10deg) !important; margin-left: 20px !important; margin-bottom: 0 !important;
                    padding: 4px 15px !important; z-index: 2 !important; box-shadow: 4px 0 0 var(--border-color) !important;
                }
                #chatContainer ~ .input-wrapper { background: transparent !important; border: none !important; padding: 10px 15px 30px 15px !important; }
                #chatContainer ~ .input-wrapper .input-area {
                    background: var(--panel-bg) !important; border: 4px solid var(--border-color) !important;
                    border-radius: 0 !important; box-shadow: 6px 6px 0 var(--border-color) !important;
                    padding: 8px !important; display: flex !important; align-items: center !important; gap: 10px !important;
                }
                #chatContainer ~ .input-wrapper .tool-icon-btn {
                    border: 3px solid var(--border-color) !important; border-radius: 0 !important; 
                    background: var(--bg-color) !important; box-shadow: 2px 2px 0 var(--border-color) !important;
                    width: 34px !important; height: 34px !important; transition: 0.1s !important;
                }
                #chatContainer ~ .input-wrapper .tool-icon-btn:active { transform: translate(2px,2px) !important; box-shadow: 0 0 0 !important; }
                #chatContainer ~ .input-wrapper .input-box { border-left: 4px dashed var(--border-color) !important; padding-left: 12px !important; flex: 1 !important; border-bottom: none !important; border-top: none !important; border-right: none !important;}
                #chatContainer ~ .input-wrapper .send-btn {
                    border: 3px solid var(--border-color) !important; border-radius: 0 !important; 
                    background: var(--text-color) !important; color: var(--bg-color) !important; 
                    box-shadow: -3px 3px 0 var(--border-color) !important; font-family: monospace !important; 
                    letter-spacing: 1px !important; padding: 8px 12px !important; margin: 0 !important; font-style: normal !important;
                }
                #chatContainer ~ .input-wrapper .send-btn:active { transform: translate(-2px,2px) !important; box-shadow: 0 0 0 !important; }
            `;
            break;
            
        case 'minimalist_line':
            // 极简下划线：无框无阴影，仅留线条托底
            css = `
                #chatContainer ~ .input-wrapper .input-top-tag { display: none !important; }
                #chatContainer ~ .input-wrapper { background: var(--bg-color) !important; border-top: 1px dashed var(--border-color) !important; padding: 15px 15px 25px 15px !important; box-shadow: none !important; }
                #chatContainer ~ .input-wrapper .input-area { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; gap: 8px !important; align-items: flex-end !important; }
                #chatContainer ~ .input-wrapper .tool-icon-btn { border: none !important; background: transparent !important; box-shadow: none !important; color: var(--text-color) !important; padding: 0 !important; width: 30px !important; height: 30px !important; margin-bottom: 2px !important;}
                #chatContainer ~ .input-wrapper .tool-icon-btn:active { transform: scale(0.9) !important; opacity: 0.6 !important; }
                #chatContainer ~ .input-wrapper .input-box { border: none !important; border-bottom: 3px solid var(--text-color) !important; border-radius: 0 !important; padding: 0 0 5px 0 !important; flex: 1 !important; }
                #chatContainer ~ .input-wrapper .main-input { padding: 0 !important; font-size: 1.1em !important; }
                #chatContainer ~ .input-wrapper .send-btn { background: transparent !important; border: none !important; box-shadow: none !important; color: var(--text-color) !important; font-style: italic !important; padding: 0 4px 6px 8px !important; border-bottom: 3px solid var(--text-color) !important; border-radius: 0 !important; margin: 0 !important; font-size: 1.1em !important;}
                #chatContainer ~ .input-wrapper .send-btn:active { transform: translateX(4px) !important; opacity: 0.5 !important;}
            `;
            break;

        case 'glassmorphism':
            // 全透毛玻璃：磨砂透视，圆润无边，智能适配深浅色模式
            css = `
                #chatContainer { padding-bottom: 100px !important; }
                #chatContainer ~ .input-wrapper .input-top-tag { display: none !important; }
                #chatContainer ~ .input-wrapper { position: absolute !important; bottom: 0 !important; left: 0 !important; right: 0 !important; pointer-events: none !important; background: transparent !important; border: none !important; padding: 10px 15px 25px 15px !important; z-index: 10 !important; }
                /* 加一层向上的渐变遮罩融合背景 */
                #chatContainer ~ .input-wrapper::before { content:''; position:absolute; bottom:0; left:0; right:0; height: 120px; background: linear-gradient(to top, var(--bg-color) 30%, transparent); pointer-events: none; z-index: -1; }
                #chatContainer ~ .input-wrapper .input-area {
                    pointer-events: auto !important;
                    background: rgba(255, 255, 255, 0.4) !important; backdrop-filter: blur(15px) !important; -webkit-backdrop-filter: blur(15px) !important;
                    border: 2px solid rgba(255, 255, 255, 0.5) !important; border-radius: 28px !important; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1) !important;
                    padding: 8px 12px !important; gap: 8px !important; align-items: center !important;
                }
                /* 暗黑模式下的毛玻璃适配 */
                [data-theme="dark"] #chatContainer ~ .input-wrapper .input-area { background: rgba(40, 40, 40, 0.5) !important; border-color: rgba(255, 255, 255, 0.1) !important; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important; }
                
                #chatContainer ~ .input-wrapper .tool-icon-btn { border: none !important; background: transparent !important; box-shadow: none !important; color: var(--text-color) !important; width: 30px !important; height: 30px !important; }
                #chatContainer ~ .input-wrapper .input-box { border: none !important; background: rgba(255,255,255,0.3) !important; border-radius: 16px !important; padding: 6px 12px !important; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02) !important;}
                [data-theme="dark"] #chatContainer ~ .input-wrapper .input-box { background: rgba(0,0,0,0.3) !important; }
                #chatContainer ~ .input-wrapper .main-input { font-weight: normal !important; padding: 0 !important; }
                
                #chatContainer ~ .input-wrapper .send-btn { 
                    border: none !important; border-radius: 50% !important; width: 38px !important; height: 38px !important; padding: 0 !important; 
                    display: flex !important; justify-content: center !important; align-items: center !important; min-width: 38px !important; 
                    background: var(--text-color) !important; color: var(--bg-color) !important; font-size: 0 !important; box-shadow: none !important; margin: 0 !important;
                }
                #chatContainer ~ .input-wrapper .send-btn::after { content: '↑'; font-style: normal; font-weight: 900; font-size: 18px; }
            `;
            break;

        case 'side_dock':
            // 【侧边悬浮坞】：画师最爱的侧边垂直操作盘，输入框浮于底部
            css = `
                #chatContainer ~ .input-wrapper .input-top-tag { display: none !important; }
                
                /* 工具栏排成竖列，固定在屏幕右侧悬浮 */
                #chatContainer ~ .input-wrapper .tool-btns {
                    position: fixed !important;
                    bottom: 120px !important;
                    right: 15px !important;
                    flex-direction: column !important;
                    gap: 12px !important;
                    background: rgba(255,255,255,0.7) !important;
                    backdrop-filter: blur(12px) !important;
                    -webkit-backdrop-filter: blur(12px) !important;
                    border: 3px solid var(--border-color) !important;
                    border-radius: 20px !important;
                    padding: 12px 8px !important;
                    box-shadow: 4px 4px 0 var(--border-color), 0 10px 20px rgba(0,0,0,0.1) !important;
                    z-index: 99 !important;
                }
                [data-theme="dark"] #chatContainer ~ .input-wrapper .tool-btns { background: rgba(0,0,0,0.6) !important; }
                
                /* 侧边按钮改圆角 */
                #chatContainer ~ .input-wrapper .tool-icon-btn { border-radius: 50% !important; background: var(--bg-color) !important; }
                
                #chatContainer { padding-bottom: 90px !important; }
                /* 底部输入框变更为极简无边框悬浮条 */
                #chatContainer ~ .input-wrapper { position: absolute !important; bottom: 0 !important; left: 0 !important; right: 0 !important; z-index: 100 !important; background: transparent !important; border-top: none !important; padding: 10px 15px 25px 15px !important; pointer-events: none !important; }
                #chatContainer ~ .input-wrapper .input-area { pointer-events: auto !important; background: var(--panel-bg) !important; border: 3px solid var(--border-color) !important; box-shadow: 0 6px 0 var(--border-color) !important; border-radius: 16px !important; padding-left: 12px !important;}
                #chatContainer ~ .input-wrapper .input-box { border-left: none !important; }
            `;
            break;

        default:
            css = ''; // 恢复系统默认
    }
    
    currentSettings.inputPresetCss = css;
    await putToDB('settings', { key: 'config', value: currentSettings });
    
    const customInputStyle = document.getElementById('customInputCss');
    if (customInputStyle) customInputStyle.innerHTML = css;
    
    // 强制把容器滑动到底部，防止更换底栏高度变化导致画面被遮挡
    setTimeout(() => { if (typeof scrollToBottom === 'function') scrollToBottom(true); }, 50);

    let t = document.createElement('div');
    t.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:var(--text-color); color:var(--bg-color); padding:15px 25px; border-radius:8px; font-weight:900; font-size:1.1em; z-index:999999; box-shadow: 4px 4px 0 var(--border-color); opacity:0; transition:opacity 0.2s;';
    t.innerText = styleId === 'default' ? '已恢复默认底栏排版' : '底栏排版已应用';
    document.body.appendChild(t);
    setTimeout(() => t.style.opacity = '1', 10);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 1500);
}
            
/* ================= 音乐系统核心逻辑 (极致本地持久化版) ================= */
let qrCheckTimer = null;
const MY_API_BASE = "https://api-enhanced-pi-coral.vercel.app";

let cachedMusicList = []; // 全局持久化播放列表
let neteaseCacheData = null; // 网易云用户资料和歌单目录本地缓存
let neteasePlaylistDetails = {}; // 每个歌单内的歌曲详情本地缓存

let tempDetailSongs = []; // 正在预览的某个歌单歌曲
let currentDetailPlId = null; // 当前正在查看的歌单ID
let currentDetailPlName = null; // 当前正在查看的歌单名字

function showMusicToast(msg) {
    let t = document.createElement('div');
    t.style.cssText = 'position:fixed; bottom:120px; left:50%; transform:translateX(-50%); background:var(--text-color); color:var(--bg-color); padding:10px 20px; border-radius:24px; font-weight:900; font-size:0.95em; z-index:999999; opacity:0; transition:opacity 0.3s; pointer-events:none; box-shadow:0 4px 10px rgba(0,0,0,0.2); text-align:center;';
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(()=>t.style.opacity='1', 10);
    setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 2500);
}

// 打开前先把数据库里的东西全捞出来放到内存
async function initMusicDatabase() {
    const dbMusic = await getFromDB('settings', 'cachedMusicList');
    if (dbMusic) cachedMusicList = dbMusic.value;

    const dbNetease = await getFromDB('settings', 'neteaseCacheData');
    if (dbNetease) neteaseCacheData = dbNetease.value;

    const dbDetails = await getFromDB('settings', 'neteasePlaylistDetails');
    if (dbDetails) neteasePlaylistDetails = dbDetails.value;
}

async function openMusicModal() {
    document.getElementById('sideToolbar').classList.remove('open');
    await initMusicDatabase(); // 读取所有的本地存储
    
    document.getElementById('musicModal').style.display = 'flex';
    switchMusicTab('netease'); 
    closePlaylistDetail();
    checkNeteaseLoginState();  
}

function closeMusicModal() {
    document.getElementById('musicModal').style.display = 'none';
    if (qrCheckTimer) clearInterval(qrCheckTimer);
}

function switchMusicTab(tab) {
    document.getElementById('musicTabNetease').classList.remove('active');
    document.getElementById('musicTabCustom').classList.remove('active');
    document.getElementById('musicTabList').classList.remove('active');
    
    document.getElementById('musicContentNetease').style.display = 'none';
    document.getElementById('musicContentCustom').style.display = 'none';
    document.getElementById('musicContentList').style.display = 'none';
    
    if (tab === 'netease') {
        document.getElementById('musicTabNetease').classList.add('active');
        document.getElementById('musicContentNetease').style.display = 'flex';
    } else if (tab === 'custom') {
        document.getElementById('musicTabCustom').classList.add('active');
        document.getElementById('musicContentCustom').style.display = 'flex';
    } else if (tab === 'list') {
        document.getElementById('musicTabList').classList.add('active');
        document.getElementById('musicContentList').style.display = 'flex';
        renderCurrentMusicQueue(); 
    }
}

// 检查状态，优先读本地缓存，0延迟断网秒开
function checkNeteaseLoginState() {
    const cookie = localStorage.getItem('netease_cookie');
    const loginBtn = document.getElementById('netease-login-btn');
    const syncBtn = document.getElementById('netease-sync-btn');
    const logoutBtn = document.getElementById('netease-logout-btn');
    const nameEl = document.getElementById('netease-nickname');
    const statusEl = document.getElementById('netease-status');
    const avatarEl = document.getElementById('netease-avatar');
    
    if (cookie) {
        loginBtn.style.display = 'none';
        syncBtn.style.display = 'block';
        logoutBtn.style.display = 'block';
        document.getElementById('qr-login-box').style.display = 'none';
        
        // 如果有本地数据，直接渲染不需要走网络！
        if (neteaseCacheData && neteaseCacheData.profile) {
            renderMyPlaylists(neteaseCacheData);
        } else {
            // 没有本地缓存，只能强行走网络
            syncNeteaseFromCloud();
        }
    } else {
        nameEl.innerText = "未登录";
        statusEl.innerText = "需扫码连接云端以获取歌单";
        avatarEl.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" stroke="var(--text-color)" fill="none" stroke-width="2.5"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
        loginBtn.style.display = 'block';
        syncBtn.style.display = 'none';
        logoutBtn.style.display = 'none';
        document.getElementById('playlist-title-area').style.display = 'none';
        document.getElementById('my-playlists-box').style.display = 'none';
    }
}

async function logoutNetease() {
    showCustomConfirm("确定要清除账号缓存并断开连接吗？\n你的【播放列表】不会受影响。", async () => {
        localStorage.removeItem('netease_cookie');
        neteaseCacheData = null;
        neteasePlaylistDetails = {};
        await deleteFromDB('settings', 'neteaseCacheData');
        await deleteFromDB('settings', 'neteasePlaylistDetails');
        if (qrCheckTimer) clearInterval(qrCheckTimer);
        checkNeteaseLoginState();
    });
}

async function startQrLogin() {
    const box = document.getElementById('qr-login-box');
    const img = document.getElementById('qr-img');
    const statusText = document.getElementById('qr-status');
    
    document.getElementById('playlist-title-area').style.display = 'none';
    document.getElementById('my-playlists-box').style.display = 'none';
    box.style.display = 'flex';
    
    // 1. 隐藏掉原本要显示二维码的图片框
    img.style.display = 'none'; 
    
    // 2. 把下面提示文字变成醒目的红色警告
    statusText.innerText = "⛔ 官方接口已失效，此功能停用";
    statusText.style.background = "#ff4444";
    statusText.style.color = "#fff";
    
    // 3. 弹出高级提示框
    showCustomConfirm("宝，网易云官方风控太严，扫码播放功能目前已无法使用啦😭\n\n强烈推荐使用顶部的【外部链接】功能！直接粘贴 MP3 直链，这才是最稳定、永远不会失效的听歌方式哦！", () => {
        // 当用户点击“确定”时，自动帮他切换到“外部链接”那一页
        switchMusicTab('custom');
    });
}

async function checkQrStatus(unikey) {
    const statusText = document.getElementById('qr-status');
    try {
        const checkRes = await fetch(`${MY_API_BASE}/login/qr/check?key=${unikey}&timerstamp=${Date.now()}`);
        const checkData = await checkRes.json();

        if (checkData.code === 800) {
            statusText.innerText = "二维码过期，请重新获取";
            clearInterval(qrCheckTimer);
        } else if (checkData.code === 802) {
            statusText.innerText = "扫描成功！请在手机确认授权";
        } else if (checkData.code === 803) {
            clearInterval(qrCheckTimer);
            statusText.innerText = "登录成功！";
            localStorage.setItem('netease_cookie', checkData.cookie); 
            showMusicToast("已成功接入！正在拉取云端数据...");
            setTimeout(() => {
                document.getElementById('qr-login-box').style.display = 'none';
                syncNeteaseFromCloud(); // 第一次登录，强制拉取云端
            }, 1000);
        }
    } catch (error) {}
}

// 强制同步云端数据（必须挂梯子）
async function syncNeteaseFromCloud() {
    const cookie = localStorage.getItem('netease_cookie');
    const syncBtn = document.getElementById('netease-sync-btn');
    const oldText = syncBtn.innerText;
    
    syncBtn.innerText = "同步中...";
    syncBtn.style.pointerEvents = "none";
    document.getElementById('netease-status').innerText = "正在翻山越岭请求网络...";

    try {
        const accRes = await fetch(`${MY_API_BASE}/user/account?cookie=${encodeURIComponent(cookie)}&timerstamp=${Date.now()}`);
        const accData = await accRes.json();
        
        if (!accData.profile) {
            showCustomConfirm("Cookie已失效，请重新扫码登录", () => { logoutNetease(); });
            return;
        }
        
        const profile = accData.profile;
        const plRes = await fetch(`${MY_API_BASE}/user/playlist?uid=${profile.userId}&cookie=${encodeURIComponent(cookie)}&timerstamp=${Date.now()}`);
        const plData = await plRes.json();
        
        // 构建要持久化的对象
        neteaseCacheData = {
            profile: profile,
            playlist: plData.playlist || []
        };
        
        // 存入IndexedDB持久化！
        await putToDB('settings', { key: 'neteaseCacheData', value: neteaseCacheData });
        
        showMusicToast("云端同步完成！已缓存至本地");
        renderMyPlaylists(neteaseCacheData); // 渲染数据
    } catch (error) {
        showMusicToast("同步失败，请检查梯子是否开启");
        // 如果失败，回滚到原本的本地数据显示
        if (neteaseCacheData && neteaseCacheData.profile) {
            renderMyPlaylists(neteaseCacheData);
        }
    } finally {
        syncBtn.innerText = oldText;
        syncBtn.style.pointerEvents = "auto";
    }
}

// 纯净的本地渲染函数，无网络请求
function renderMyPlaylists(cacheObj) {
    const profile = cacheObj.profile;
    document.getElementById('netease-nickname').innerText = profile.nickname;
    document.getElementById('netease-avatar').innerHTML = `<img src="${profile.avatarUrl}?param=100y100" style="width:100%; height:100%; object-fit:cover;">`;
    document.getElementById('netease-status').innerText = "已加载本地数据库缓存";

    const box = document.getElementById('my-playlists-box');
    const titleArea = document.getElementById('playlist-title-area');
    
    titleArea.style.display = 'flex';
    box.style.display = 'flex';
    box.innerHTML = '';

    if (cacheObj.playlist && cacheObj.playlist.length > 0) {
        cacheObj.playlist.forEach(pl => {
            const item = document.createElement('div');
            item.style.cssText = "background: var(--panel-bg); border: 3px solid var(--border-color); border-radius: 12px; padding: 10px; display: flex; align-items: center; gap: 12px; box-shadow: 4px 4px 0 var(--border-color);";
            item.innerHTML = `
                <div style="position:relative; width: 50px; height: 50px; flex-shrink: 0;">
                    <img src="${pl.coverImgUrl}?param=100y100" style="width: 100%; height: 100%; border-radius: 8px; border: 2px solid var(--border-color); object-fit:cover;">
                    <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:12px; height:12px; background:var(--panel-bg); border:2px solid var(--border-color); border-radius:50%;"></div>
                </div>
                <div style="flex: 1; min-width: 0; display:flex; flex-direction:column; justify-content:center;">
                    <div style="font-weight: 900; font-size: 1.05em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-color);">${pl.name}</div>
                    <div style="font-size: 0.75em; opacity: 0.7; font-weight: bold; margin-top: 2px; font-style:italic;">共 ${pl.trackCount} 首</div>
                </div>
                <button class="outline-btn" style="width: auto; margin: 0; padding: 6px 12px; font-size: 0.9em; border-radius: 6px; box-shadow: 2px 2px 0 var(--border-color);" onclick="openPlaylistDetail('${pl.id}', '${pl.name.replace(/'/g, "\\'")}')">打开查看</button>
            `;
            box.appendChild(item);
        });
    } else {
        box.innerHTML = '<div style="font-weight:900; text-align:center;">暂无歌单</div>';
    }
}

// 展开某个歌单（优先读本地数据库，没有再去网络拉）
async function openPlaylistDetail(plId, plName) {
    currentDetailPlId = plId;
    currentDetailPlName = plName;
    
    // 如果本地数据库里已经有这个歌单所有的歌，直接秒开！
    if (neteasePlaylistDetails[plId]) {
        tempDetailSongs = neteasePlaylistDetails[plId];
        renderDetailSongsList();
        showDetailLayer();
        return;
    }
    
    // 没有数据，必须走网络拉一次
    syncDetailFromCloud();
}

// 强制同步某个具体的歌单详情
async function syncDetailFromCloud() {
    if (!currentDetailPlId) return;
    
    const cookie = localStorage.getItem('netease_cookie');
    const syncBtn = document.getElementById('btn-sync-detail');
    syncBtn.style.pointerEvents = "none";
    syncBtn.style.opacity = "0.5";
    
    showDetailLayer();
    document.getElementById('detail-songs-list').innerHTML = '<div style="text-align:center; opacity:0.5; font-weight:900; padding:20px;">正在穿透网络拉取云端歌曲...</div>';

    try {
        const plRes = await fetch(`${MY_API_BASE}/playlist/detail?id=${currentDetailPlId}&cookie=${encodeURIComponent(cookie)}&timerstamp=${Date.now()}`);
        const plJson = await plRes.json();
        
        if (plJson.playlist && plJson.playlist.tracks) {
            // 拿到所有数据，不限 50 首
            const tracks = plJson.playlist.tracks; 
            
            tempDetailSongs = tracks.map((song, idx) => ({
                id: song.id,
                title: song.name,
                singer: song.ar ? song.ar.map(a => a.name).join(' / ') : "未知",
                cover: song.al ? song.al.picUrl : "",
                url: `https://music.163.com/song/media/outer/url?id=${song.id}.mp3`,
                index: idx
            }));
            
            // 存入内存字典，然后持久化到 IndexedDB！
            neteasePlaylistDetails[currentDetailPlId] = tempDetailSongs;
            await putToDB('settings', { key: 'neteasePlaylistDetails', value: neteasePlaylistDetails });
            
            showMusicToast("已同步并缓存到本地，以后可断网秒开");
            renderDetailSongsList();
        }
    } catch (e) {
        document.getElementById('detail-songs-list').innerHTML = '<div style="text-align:center; color:#ff4444; font-weight:900; padding:20px;">拉取失败，请检查梯子和网络状态</div>';
    } finally {
        syncBtn.style.pointerEvents = "auto";
        syncBtn.style.opacity = "1";
    }
}

function showDetailLayer() {
    document.getElementById('music-profile-card').style.display = 'none';
    document.getElementById('qr-login-box').style.display = 'none';
    document.getElementById('playlist-title-area').style.display = 'none';
    document.getElementById('my-playlists-box').style.display = 'none';
    document.getElementById('playlist-detail-box').style.display = 'flex';
}

function renderDetailSongsList() {
    document.getElementById('detail-playlist-name').innerText = currentDetailPlName;
    document.getElementById('selectAllSongsCb').checked = false; // 默认不全选
    
    const listContainer = document.getElementById('detail-songs-list');
    listContainer.innerHTML = '';
    
    if (tempDetailSongs.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center; opacity:0.5; font-weight:900; padding:20px;">这个歌单是空的哦</div>';
        return;
    }
    
    tempDetailSongs.forEach(song => {
        const item = document.createElement('label');
        item.style.cssText = "background: var(--panel-bg); border: 3px solid var(--border-color); padding: 10px; border-radius: 8px; display: flex; align-items: center; gap: 12px; box-shadow: 2px 2px 0 var(--border-color); cursor: pointer;";
        item.innerHTML = `
            <input type="checkbox" class="song-checkbox" value="${song.index}" style="width: 20px; height: 20px; accent-color: var(--text-color); flex-shrink: 0;">
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column;">
                <div style="font-weight: 900; font-size: 1.05em; color: var(--text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${song.title}</div>
                <div style="font-size: 0.75em; opacity: 0.7; font-weight: bold; font-style: italic; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${song.singer}</div>
            </div>
        `;
        listContainer.appendChild(item);
    });
}

function closePlaylistDetail() {
    document.getElementById('playlist-detail-box').style.display = 'none';
    currentDetailPlId = null;
    currentDetailPlName = null;
    
    // 如果在登录状态，恢复首页的展示
    if (localStorage.getItem('netease_cookie')) {
        document.getElementById('music-profile-card').style.display = 'flex';
        document.getElementById('playlist-title-area').style.display = 'flex';
        document.getElementById('my-playlists-box').style.display = 'flex';
    }
}

function toggleSelectAllSongs(isChecked) {
    const cbs = document.querySelectorAll('.song-checkbox');
    cbs.forEach(cb => cb.checked = isChecked);
}

// 加入播放列表（附带是否下载歌词的智能分离选项）
window.confirmAddSelectedSongs = async function() {
    const cbs = document.querySelectorAll('.song-checkbox:checked');
    if (cbs.length === 0) {
        showMusicToast("请至少勾选一首歌哦！");
        return;
    }
    
    // 🌟 智能弹窗：让用户自己选要不要歌词
    const needLyrics = confirm(`您勾选了 ${cbs.length} 首歌。\n\n是否同时下载并缓存它们的歌词？\n\n【确定】= 同时下载歌词 (歌曲较多时会很慢)\n【取消】= 仅极速导入歌曲 (以后听的时候会自动补齐歌词)`);
    
    if (needLyrics) {
        showMusicToast("正在批量拉取歌词，这可能需要几十秒，请耐心稍候...");
    }

    const cookie = localStorage.getItem('netease_cookie') || '';
    const currentIds = new Set(cachedMusicList.map(m => m.id));
    let addCount = 0;
    
    for (let cb of cbs) {
        const idx = parseInt(cb.value);
        let st = tempDetailSongs[idx];
        if (st && !currentIds.has(st.id)) {
            // 如果用户选了要歌词，才去费时费力拉取
            if (needLyrics) {
                try {
                    const res = await fetch(`${MY_API_BASE}/lyric?id=${st.id}&cookie=${encodeURIComponent(cookie)}&timerstamp=${Date.now()}`);
                    const data = await res.json();
                    if (data && data.lrc && data.lrc.lyric) {
                        st.lyric = data.lrc.lyric; // 存入原生态 LRC 文本
                    }
                } catch(e) {
                    console.log(`歌曲 ${st.title} 歌词拉取失败`);
                }
            }
            
            cachedMusicList.push(st);
            addCount++;
        }
    }
    
    // 将播放列表彻底写入持久化数据库！
    await putToDB('settings', { key: 'cachedMusicList', value: cachedMusicList });
    
    showMusicToast(`极速添加了 ${addCount} 首新歌！`);
    closePlaylistDetail();
    switchMusicTab('list');
}

// 添加外部直链并持久化
async function importCustomMusic() {
    const title = document.getElementById('customMusicTitle').value.trim();
    const singer = document.getElementById('customMusicSinger').value.trim() || "未知歌手";
    const url = document.getElementById('customMusicUrl').value.trim();
    
    if (!title || !url) {
        showMusicToast("歌曲名称和音频直链URL为必填项！"); // 换成悬浮提示
        return;
    }
    
    cachedMusicList.push({
        id: 'custom_' + Date.now(),
        title: title,
        singer: singer,
        url: url
    });
    
    await putToDB('settings', { key: 'cachedMusicList', value: cachedMusicList });
    
    document.getElementById('customMusicTitle').value = '';
    document.getElementById('customMusicSinger').value = '';
    document.getElementById('customMusicUrl').value = '';
    
    showMusicToast("直链已永久加入本地播放列表！"); // 已经是悬浮提示了
    switchMusicTab('list');
}

function renderCurrentMusicQueue() {
    const container = document.getElementById('currentMusicQueueRender');
    container.innerHTML = '';
    
    if (cachedMusicList.length === 0) {
        container.innerHTML = '<div style="text-align:center; opacity:0.5; font-weight:900; padding:40px 0; font-style:italic;">列表空空如也，去歌单里挑几首加进来吧</div>';
        return;
    }
    
    cachedMusicList.forEach((song, index) => {
        const item = document.createElement('div');
        item.style.cssText = "background: var(--panel-bg); border: 3px solid var(--border-color); padding: 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; box-shadow: 2px 2px 0 var(--border-color);";
        
        // 核心修改：在这里给每首歌加了一个圆形的播放按钮
        item.innerHTML = `
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column;">
                <div style="font-weight: 900; font-size: 1.05em; color: var(--text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${song.title}</div>
                <div style="font-size: 0.75em; opacity: 0.7; font-weight: bold; font-style: italic; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${song.singer}</div>
            </div>
            <div style="display:flex; gap: 12px; flex-shrink: 0; align-items: center;">
                <button class="icon-btn" style="border: 2px solid var(--text-color); color: var(--text-color); padding: 0; box-shadow: 2px 2px 0 var(--text-color); border-radius: 50%; width: 30px; height: 30px; display: flex; justify-content: center; align-items: center;" onclick="playSpecificMusic(${index}); closeMusicModal();">
                    <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; margin-left: 2px;"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"></polygon></svg>
                </button>
                <button class="icon-btn" style="border: none; color: #ff4444; padding: 5px; box-shadow: none;" onclick="removeMusicFromList(${index})">✖</button>
            </div>
        `;
        container.appendChild(item);
    });
}

async function removeMusicFromList(index) {
    cachedMusicList.splice(index, 1);
    await putToDB('settings', { key: 'cachedMusicList', value: cachedMusicList });
    renderCurrentMusicQueue();
}

function clearMusicList() {
    if (cachedMusicList.length === 0) return;
    showCustomConfirm("确定要清空本地的播放列表吗？", async () => {
        cachedMusicList = [];
        await putToDB('settings', { key: 'cachedMusicList', value: cachedMusicList });
        renderCurrentMusicQueue();
    });
}
    
// ==================== 顶部悬浮音乐播放器核心逻辑 ====================
let currentPlayingIndex = -1;
const audioPlayer = document.getElementById('bgMusicAudio');

// 切换顶栏显示开关
async function toggleTopMusicBar(isChecked) {
    currentSettings.showTopMusicBar = isChecked ? "true" : "false";
    await putToDB('settings', { key: 'config', value: currentSettings });
    syncTopMusicPlayerUI();
}

// 同步 UI 状态（带开关记忆与断点恢复）
function syncTopMusicPlayerUI() {
    const box = document.getElementById('topMusicPlayerBox');
    
    // 检查设置开关（默认为开启）
    const isEnabled = currentSettings.showTopMusicBar !== "false";
    const toggleEl = document.getElementById('topMusicBarToggle');
    if (toggleEl) toggleEl.checked = isEnabled;

    if (!isEnabled || !cachedMusicList || cachedMusicList.length === 0) {
        box.style.display = 'none';
        return;
    }
    box.style.display = 'block';
    
    // 恢复记忆的歌曲索引
    if (currentPlayingIndex === -1 || currentPlayingIndex >= cachedMusicList.length) {
        currentPlayingIndex = currentSettings.lastMusicIndex !== undefined ? currentSettings.lastMusicIndex : 0;
        if (currentPlayingIndex >= cachedMusicList.length) currentPlayingIndex = 0;
    }
    const curSong = cachedMusicList[currentPlayingIndex];
    
    // 渲染文案和封面
    const showTitle = `${curSong.title} - ${curSong.singer || '未知'}`;
    document.getElementById('pillMusicTitle').innerText = showTitle;
    document.getElementById('cardMusicTitle').innerText = curSong.title;
    document.getElementById('cardMusicSinger').innerText = curSong.singer || '未知';
    document.getElementById('cardMusicCover').src = curSong.cover || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='none' stroke='black'><circle cx='50' cy='50' r='30'/></svg>";

    renderTopPlaylist();
}

function toggleMusicMode() {
    const pill = document.getElementById('musicPillMode');
    const card = document.getElementById('musicCardMode');
    if (pill.style.display !== 'none') {
        pill.style.display = 'none';
        card.style.display = 'flex';
    } else {
        pill.style.display = 'flex';
        card.style.display = 'none';
    }
}

function toggleMusicListPanel() {
    const panel = document.getElementById('musicListPanel');
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    if (panel.style.display === 'flex') renderTopPlaylist();
}

function renderTopPlaylist() {
    const container = document.getElementById('musicListRenderUI');
    container.innerHTML = '';
    cachedMusicList.forEach((song, idx) => {
    const item = document.createElement('div');
    item.className = `m-l-item ${idx === currentPlayingIndex ? 'playing' : ''}`;
    item.style.cssText = "display:flex; justify-content:space-between; align-items:center;";
    item.innerHTML = `
        <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-right:10px;" onclick="playSpecificMusic(${idx})">
            ${song.title} - ${song.singer||''}
        </div>
        <button class="icon-btn" style="border:none; background:transparent; padding:4px; box-shadow:none; flex-shrink:0;" onclick="event.stopPropagation(); shareMusicCard(${idx}, 'user'); toggleMusicListPanel();">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
        </button>
    `;
    container.appendChild(item);
});
}

// --- 新增：获取真实歌曲直链的核心引擎 ---
async function fetchRealMusicUrl(song) {
    // 如果是外部导入的直链，直接返回不用解析
    if (!song.id || String(song.id).startsWith('custom_')) return song.url;

    const cookie = localStorage.getItem('netease_cookie') || '';
    try {
        // 调用你部署的 Vercel API，带上你的尊贵身份，获取 VIP 也能听的真实直链！
        const res = await fetch(`${MY_API_BASE}/song/url/v1?id=${song.id}&randomCNIP=true&cookie=${encodeURIComponent(cookie)}&timestamp=${Date.now()}`);
        const data = await res.json();
        if (data && data.data && data.data[0] && data.data[0].url) {
            // 强行把 http 替换成 https，完美兼容 Github Pages，绝不报错
            return data.data[0].url.replace(/^http:\/\//i, 'https://');
        }
    } catch (err) {
        console.log("获取真实链接失败，准备使用备用链接", err);
    }
    // 兜底：如果 API 抽风了，把原本的外链也强行升级成 HTTPS
    return song.url.replace(/^http:\/\//i, 'https://');
}

// 播放/暂停（附带断点记忆唤醒）
async function toggleMusicPlay() {
    if (!cachedMusicList || cachedMusicList.length === 0) return;

    if (currentPlayingIndex === -1 || currentPlayingIndex >= cachedMusicList.length) {
        currentPlayingIndex = 0;
    }

    if (audioPlayer.paused) {
        // 【核心黑科技】：先给播放器塞个空音频垫底，骗过手机浏览器的“禁止自动播放”限制
        if (!audioPlayer.src || audioPlayer.src.includes(window.location.host)) {
            audioPlayer.src = "silence.mp3";
        }
        audioPlayer.play().catch(e=>{});

        const song = cachedMusicList[currentPlayingIndex];
        // 瞬间向你的服务器请求这首歌此时此刻的真实链接（还能防链接过期）
        const realUrl = await fetchRealMusicUrl(song);
        
        // 只有当 src 不匹配时才重新赋值（防止断点记忆被重置）
        if (audioPlayer.src !== realUrl) {
            audioPlayer.src = realUrl;
            if (currentSettings.lastMusicTime) {
                audioPlayer.currentTime = currentSettings.lastMusicTime;
            }
        }

        audioPlayer.play().catch(e => {
            console.log("播放依然被拦截:", e);
            updatePlayIconState(); 
        });
    } else {
        audioPlayer.pause();
        currentSettings.lastMusicTime = audioPlayer.currentTime;
        putToDB('settings', { key: 'config', value: currentSettings });
    }
    updatePlayIconState();
}

// 播放指定的某首歌
async function playSpecificMusic(idx) {
    if (!cachedMusicList || !cachedMusicList[idx]) return;
    currentPlayingIndex = idx;

    currentSettings.lastMusicIndex = idx;
    currentSettings.lastMusicTime = 0; // 切新歌进度归零
    putToDB('settings', { key: 'config', value: currentSettings });

    // 【核心黑科技】：骗过手机限制
    audioPlayer.src = "silence.mp3";
    audioPlayer.play().catch(e=>{});

    const song = cachedMusicList[currentPlayingIndex];
    const realUrl = await fetchRealMusicUrl(song);

    audioPlayer.src = realUrl;
    audioPlayer.play();
    syncTopMusicPlayerUI();
    updatePlayIconState();
}

function playNextMusic() {
    if (!cachedMusicList || cachedMusicList.length === 0) return;
    currentPlayingIndex = (currentPlayingIndex + 1) % cachedMusicList.length;
    playSpecificMusic(currentPlayingIndex);
}

function playPrevMusic() {
    if (!cachedMusicList || cachedMusicList.length === 0) return;
    currentPlayingIndex = (currentPlayingIndex - 1 + cachedMusicList.length) % cachedMusicList.length;
    playSpecificMusic(currentPlayingIndex);
}

function updatePlayIconState() {
    const isPaused = audioPlayer.paused;
    const playSvg = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    const pauseSvg = `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    
    document.getElementById('pillPlayBtn').innerHTML = isPaused ? playSvg : pauseSvg;
    document.getElementById('cardPlayBtn').innerHTML = isPaused ? playSvg : pauseSvg;
    
    const noteIcon = document.querySelector('.music-note-icon');
    const coverIcon = document.getElementById('cardMusicCover');
    noteIcon.style.animationPlayState = isPaused ? 'paused' : 'running';
    coverIcon.style.animationPlayState = isPaused ? 'paused' : 'running';
}

audioPlayer.addEventListener('play', updatePlayIconState);
audioPlayer.addEventListener('pause', updatePlayIconState);

const originalPutToDB = putToDB;
window.putToDB = async function(store, data) {
    await originalPutToDB(store, data);
    if (data && data.key === 'cachedMusicList') {
        syncTopMusicPlayerUI();
    }
};

// 自动记录歌曲进度 (每3秒保存一次)
setInterval(() => {
    if (!audioPlayer.paused && audioPlayer.currentTime > 0) {
        currentSettings.lastMusicTime = audioPlayer.currentTime;
        putToDB('settings', { key: 'config', value: currentSettings });
    }
}, 3000);

// ✅ 完美开机逻辑：开机时自动去后台捞取播放列表，直接恢复状态
setTimeout(async () => {
    const dbMusic = await getFromDB('settings', 'cachedMusicList');
    if (dbMusic && dbMusic.value) {
        cachedMusicList = dbMusic.value;
    }
    
    if (cachedMusicList.length > 0) {
        // 恢复断点索引和时间戳
        currentPlayingIndex = currentSettings.lastMusicIndex || 0;
        if (currentPlayingIndex >= cachedMusicList.length) currentPlayingIndex = 0;
        
        syncTopMusicPlayerUI(); // 立刻展现 UI，只要你的开关开着就会出现！
    }
}, 1500); // 提前到 1.5 秒加速展现

// 重置悬浮球位置回到屏幕中间偏右
window.resetFloatingBallPos = async function() {
    const ball = document.getElementById('floatingBall');
    if (ball) {
        // 设置为屏幕中间偏右
        ball.style.left = (window.innerWidth - ball.offsetWidth - 15) + 'px';
        ball.style.top = (window.innerHeight / 2 - 50) + 'px';
        
        // 覆盖存入数据库记忆
        currentSettings.ballLeft = ball.style.left;
        currentSettings.ballTop = ball.style.top;
        await putToDB('settings', { key: 'config', value: currentSettings });

    }
};

// 生成并发送音乐分享卡片
async function shareMusicCard(idx, sender = 'user') {
    if (!cachedMusicList || !cachedMusicList[idx]) return;
    const song = cachedMusicList[idx];
    const coverUrl = song.cover || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='none' stroke='black'><circle cx='50' cy='50' r='30'/></svg>";
    
    const htmlStr = `
        <div class="music-chat-card" onclick="playSpecificMusic(${idx})">
            <img class="mc-cover" src="${coverUrl}" />
            <div class="mc-info">
                <div class="mc-title">${song.title}</div>
                <div class="mc-singer">${song.singer || '未知歌手'}</div>
            </div>
            <div class="mc-play-btn">
                <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            </div>
        </div>
    `;

    if (sender === 'user') {
        const qData = currentQuoteData; clearQuote();
        await saveAndRenderMsg('user', htmlStr, null, Date.now(), true, null, qData);
        if (!isBatchMode) simulateReadAndReply();
    } else {
        let activeChar = charactersList.find(c => c.id === currentChatId) || charactersList[0];
        const typingIndicator = document.getElementById('typingIndicator');
        document.getElementById('chatContainer').appendChild(typingIndicator);
        typingIndicator.style.display = 'flex';
        setTimeout(() => { if (typeof scrollToBottom === 'function') scrollToBottom(false); }, 50);
        await delay(1000); 
        await saveAndRenderMsg('yume', htmlStr, null, Date.now(), true, activeChar);
        typingIndicator.style.display = 'none';
        document.body.appendChild(typingIndicator);
    }
}

/* ================= 云端歌词解析与悬浮条引擎 ================= */
let currentLyrics = []; // 存放解析后的当前歌曲时间轴
let currentLyricIndex = -1; // 记录当前正唱到哪一句

// 1. 动态在页面生成一个歌词条容器
const lyricBarEl = document.createElement('div');
lyricBarEl.id = 'musicLyricBar';
document.body.appendChild(lyricBarEl);

// 2. 解析 LRC 歌词文件的正则引擎
function parseLyric(lrcStr) {
    const lines = lrcStr.split('\n');
    const result = [];
    // 匹配 [00:15.30] 这种时间格式
    const timeReg = /\[(\d{2}):(\d{2}(?:\.\d{2,3})?)\]/;
    
    for (let line of lines) {
        const match = line.match(timeReg);
        if (match) {
            const min = parseInt(match[1]);
            const sec = parseFloat(match[2]);
            const time = min * 60 + sec;
            const text = line.replace(timeReg, '').trim();
            // 只保留有文字的行
            if (text) result.push({ time, text });
        }
    }
    return result;
}

// 3. 拦截并覆盖原本的播放函数，优先读取本地持久化歌词
const originalPlaySpecificMusicLyric = window.playSpecificMusic;
window.playSpecificMusic = function(idx) {
    originalPlaySpecificMusicLyric(idx); // 先执行原本的播放逻辑
    const song = cachedMusicList[idx];
    
    // 初始化清空上一首歌的残余
    currentLyrics = [];
    currentLyricIndex = -1;
    lyricBarEl.classList.remove('show');
    lyricBarEl.innerText = '';

    if (!song) return;

    // 🌟 优先读取本地已经永久缓存好的歌词！(0延迟，无需梯子，断网也能看)
    if (song.lyric) {
        currentLyrics = parseLyric(song.lyric);
        return;
    }

    // 如果是你以前（更新代码前）加的歌没有缓存歌词，且不是外部直链，作为兜底再尝试联网拉取一次
    if (song.id && !String(song.id).startsWith('custom_')) {
        const cookie = localStorage.getItem('netease_cookie') || '';
        fetch(`${MY_API_BASE}/lyric?id=${song.id}&cookie=${encodeURIComponent(cookie)}&timerstamp=${Date.now()}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.lrc && data.lrc.lyric) {
                    currentLyrics = parseLyric(data.lrc.lyric);
                    // 顺手把它存到本地数据库，下次就不用拉了
                    song.lyric = data.lrc.lyric;
                    putToDB('settings', { key: 'cachedMusicList', value: cachedMusicList });
                }
            })
            .catch(err => console.log("歌词拉取失败:", err));
    }
};

// 4. 监听音频的实时播放进度，毫秒级对账
audioPlayer.addEventListener('timeupdate', () => {
    // 没歌词或者没开顶栏，就不显示
    if (currentLyrics.length === 0 || currentSettings.showTopMusicBar === "false") {
        lyricBarEl.classList.remove('show');
        return;
    }

    const currentTime = audioPlayer.currentTime;
    
    // 找出当前时间处于哪一句歌词
    let activeIndex = -1;
    for (let i = 0; i < currentLyrics.length; i++) {
        if (currentTime >= currentLyrics[i].time) {
            activeIndex = i;
        } else {
            break; // 因为时间轴是按顺序排的，超过了直接打断
        }
    }

    // 如果找出来的这一句和刚才那句不一样，说明唱到下一句了，更新文字！
    if (activeIndex !== currentLyricIndex && activeIndex !== -1) {
        currentLyricIndex = activeIndex;
        lyricBarEl.innerText = currentLyrics[activeIndex].text;
        
        // 文字更新时加上显示动画
        if (!lyricBarEl.classList.contains('show')) {
            lyricBarEl.classList.add('show');
        }
    }
});

// 5. 如果暂停播放，隐藏歌词条；继续播放，恢复歌词条
audioPlayer.addEventListener('pause', () => {
    lyricBarEl.classList.remove('show');
});
audioPlayer.addEventListener('play', () => {
    if (currentLyrics.length > 0 && currentLyricIndex !== -1 && currentSettings.showTopMusicBar !== "false") {
        lyricBarEl.classList.add('show');
    }
});

// 6. 完美开机闭环：如果刚开机自动恢复了播放列表，顺手把记忆的那首歌歌词也拉下来！
setTimeout(() => {
    if (cachedMusicList && cachedMusicList.length > 0) {
        let idx = currentSettings.lastMusicIndex !== undefined ? currentSettings.lastMusicIndex : 0;
        if (idx >= cachedMusicList.length) idx = 0;
        const song = cachedMusicList[idx];
        
        if (song && song.id && !String(song.id).startsWith('custom_')) {
            const cookie = localStorage.getItem('netease_cookie') || '';
            fetch(`${MY_API_BASE}/lyric?id=${song.id}&cookie=${encodeURIComponent(cookie)}&timerstamp=${Date.now()}`)
                .then(res => res.json())
                .then(data => {
                    if (data && data.lrc && data.lrc.lyric) {
                        currentLyrics = parseLyric(data.lrc.lyric);
                    }
                }).catch(()=>{});
        }
    }
}, 2000);

/* ================= 拆红包与状态更新引擎 ================= */
async function handleRedPacketClick(rpId, sender, amount) {
    const rpEl = document.getElementById('rp_' + rpId);
    // 如果红包已经被领过或者退回，就不起作用
    if (!rpEl || rpEl.classList.contains('opened') || rpEl.classList.contains('returned')) return;

    // 如果是你自己发的红包，还没被领取
    if (sender === 'user') {
        showCustomConfirm("红包已发出，正在等待对方领取哦~", ()=>{});
        return;
    }

    // 如果是 TA 发给你的红包，你点击了！
    if (sender === 'char' || sender === 'yume') {
        let cName = currentSettings.charName || "TA";
        let sysPrefix = currentSettings.themeStyle === 'wechat' ? ' ' : 'Pay | ';
        
        // 更新 UI 和 数据库状态
        updateRedPacketStateUI(rpId, 'opened');
        
        // 弹出系统提示
        await saveAndRenderMsg('system', `${sysPrefix}你领取了 ${cName} 的红包`, null, Date.now(), true);
        
        // 如果想把这个钱存进自己的记账本里（可选联动），可以直接在这里加余额，这里简单处理就是只发通知
    }
}

// 刷新界面 UI 并永久写入数据库（防止重启后红包又变回没拆的状态）
async function updateRedPacketStateUI(rpId, status) {
    // 1. 改当前界面的 UI
    const rpEl = document.getElementById('rp_' + rpId);
    if (rpEl) {
        rpEl.classList.add(status);
        rpEl.onclick = null; // 移除点击事件
    }
    
    // 2. 查历史记录数据库，把字符串替换掉
    for (let i = allMessagesCache.length - 1; i >= 0; i--) {
        let m = allMessagesCache[i];
        if (m.text && m.text.includes(`id="rp_${rpId}"`)) {
            // 暴力替换注入 class
            m.text = m.text.replace('class="red-packet-card"', `class="red-packet-card ${status}"`);
            await putToDB('messages', m);
            break;
        }
    }
}



/* ================= 字卡一键去重功能 ================= */
async function removeDuplicateCards() {
    // 1. 获取所有的字卡
    const allCards = await getAllFromDB('wordCards');
    if (allCards.length === 0) {
        showCustomConfirm('字卡库是空的，不需要去重哦！', () => {});
        return;
    }

    // 2. 利用 Set 集合来记录已经出现过的句子，智能比对
    const seenTexts = new Set();
    const duplicateIds = []; // 用来存多余的那些废卡 ID

    for (let card of allCards) {
        const txt = card.text.trim();
        if (seenTexts.has(txt)) {
            // 如果这句话之前见过了，说明它是重复的，记录下它的 ID
            duplicateIds.push(card.id);
        } else {
            // 如果没见过，把它加进“见过”的集合里
            seenTexts.add(txt);
        }
    }

    // 3. 如果没发现重复
    if (duplicateIds.length === 0) {
        showCustomConfirm('太棒了，没有发现任何重复的字卡！', () => {});
        return;
    }

    // 4. 发现重复，弹窗确认清理
    showCustomConfirm(`扫描到 ${duplicateIds.length} 条完全重复的字卡，确定要一键清理吗？\n(仅保留其中一条)`, async () => {
        // 后台静默删除
        for (let id of duplicateIds) {
            await deleteFromDB('wordCards', id);
            selectedCardIds.delete(id); // 防错：如果它刚好被勾选了也清掉
        }
        
        // 刷新列表和分组
        await updateCategoriesList();
        renderCategorySelects();
        renderReplyGroups();
        renderCardsList();

        // 弹个优雅的小悬浮提示，不打断操作
        let t = document.createElement('div');
        t.style.cssText = 'position:fixed; bottom:120px; left:50%; transform:translateX(-50%); background:var(--text-color); color:var(--bg-color); padding:8px 16px; border-radius:20px; font-weight:900; font-size:0.9em; z-index:999999; opacity:0; transition:opacity 0.3s; pointer-events:none; box-shadow:0 4px 10px rgba(0,0,0,0.2);';
        t.innerText = `成功清理了 ${duplicateIds.length} 条重复字卡！`;
        document.body.appendChild(t);
        setTimeout(()=>t.style.opacity='1', 10);
        setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 1500);
    });
}

/* ================= 交换日记系统核心逻辑 ================= */
let diaryDataList = [];

async function openDiaryModal() {
    document.getElementById('appPanel').style.display = 'none'; // 关闭悬浮球菜单
    
    // 从数据库读取日记数据
    const data = await getFromDB('settings', 'diaryData');
    diaryDataList = data ? data.value : [];
    
    // 打开弹窗并渲染
    document.getElementById('diaryModal').style.display = 'flex';
    switchDiaryTab('active');
}

function closeDiaryModal() {
    document.getElementById('diaryModal').style.display = 'none';
}

function switchDiaryTab(tab) {
    document.getElementById('diaryTabActive').classList.remove('active');
    document.getElementById('diaryTabArchive').classList.remove('active');
    
    if (tab === 'active') {
        document.getElementById('diaryTabActive').classList.add('active');
        renderDiaryList(false); // 渲染进行中
    } else {
        document.getElementById('diaryTabArchive').classList.add('active');
        renderDiaryList(true); // 渲染已封存
    }
}

// 渲染日记本列表
function renderDiaryList(isArchive) {
    const container = document.getElementById('diaryListRender');
    container.innerHTML = '';
    
    const list = diaryDataList.filter(d => d.isArchive === isArchive && (!d.chatId || d.chatId === currentChatId));
    
    if (list.length === 0) {
        container.innerHTML = '<div style="text-align:center; opacity:0.5; font-weight:900; padding:40px 0; font-style:italic;">暂无日记本记录哦~</div>';
        return;
    }
    
    list.forEach(d => {
        const item = document.createElement('div');
        item.className = 'diary-book-card';
        
        let progressText = d.isArchive ? '已封存' : `进度: ${Math.floor(d.currentDay / 2)} / ${d.targetDays} 天`;
        
        // 动态标签样式
        let tagHtml = '';
        if (!d.isArchive) {
            if (d.currentTurn === 'user') {
                tagHtml = `<span class="diary-turn-tag">该你写啦</span>`;
            } else {
                tagHtml = `<span class="diary-turn-tag wait">等待TA下笔</span>`;
            }
        }

        item.innerHTML = `
            <div class="diary-title">${d.name}</div>
            <div class="diary-status">
                <span>${progressText}</span>
                ${tagHtml}
            </div>
        `;
        item.onclick = () => openDiaryDetail(d.id);
        
        container.appendChild(item);
    });
}

function openCreateDiaryModal() {
    document.getElementById('newDiaryName').value = '';
    document.getElementById('createDiaryModal').style.display = 'flex';
}

// 让TA帮忙选名字的小彩蛋
function randomDiaryName() {
    const names = ["盛夏的交换记事", "不可说的秘密基地", "星空下的碎碎念", "关于我们的100件小事", "写给明天的信", "月光储蓄罐", "日常发呆记录本"];
    const r = names[Math.floor(Math.random() * names.length)];
    document.getElementById('newDiaryName').value = r;
}

// 保存新建的日记本
async function saveNewDiary() {
    const name = document.getElementById('newDiaryName').value.trim();
    const days = parseInt(document.getElementById('newDiaryDays').value);
    
    if (!name) {
        showCustomConfirm('给你们的日记本起个名字吧！', ()=>{});
        return;
    }
    
    // 决定第一篇由谁先起笔（50%概率是你，50%概率是TA）
    const firstTurn = Math.random() < 0.5 ? 'user' : 'char';
    const now = Date.now();
    
    const newDiary = {
        id: 'diary_' + now,
        chatId: currentChatId,
        name: name,
        targetDays: days,
        currentDay: 0,
        isArchive: false,
        currentTurn: firstTurn, // 'user' 或 'char'
        entries: [], // 存放每一天的具体内容
        lastWriteTime: 0 // 上次写日记的时间，用来判定是否拖延
    };
    
    // 【新增核心机制】：如果是TA起笔，给TA分配一个自带的初始写作倒计时！
    if (firstTurn === 'char') {
        // TA 会在 3 分钟 到 30 分钟 的随机时间里，自动悄悄把第一篇写好
        const delayMs = Math.random() * (27 * 60 * 1000) + (3 * 60 * 1000);
        newDiary.nextWriteTime = now + delayMs;
    }
    
    diaryDataList.unshift(newDiary); // 新建的放最前面
    await putToDB('settings', { key: 'diaryData', value: diaryDataList });
    
    document.getElementById('createDiaryModal').style.display = 'none';
    
    // 弹个优雅的小提示
    let t = document.createElement('div');
    t.style.cssText = 'position:fixed; bottom:120px; left:50%; transform:translateX(-50%); background:var(--text-color); color:var(--bg-color); padding:8px 16px; border-radius:20px; font-weight:900; font-size:0.9em; z-index:999999; opacity:0; transition:opacity 0.3s; pointer-events:none; box-shadow:0 4px 10px rgba(0,0,0,0.2);';
    t.innerText = `日记本创立成功！第一篇由 ${firstTurn === 'user' ? '你' : 'TA'} 起笔。`;
    document.body.appendChild(t);
    setTimeout(()=>t.style.opacity='1', 10);
    setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 2500);

    switchDiaryTab('active');
    
    // 如果是 TA 起笔，立刻激活后台巡逻扫描器，启动倒计时！
    if (firstTurn === 'char') {
        checkPendingDiaryTasks();
    }
}

let currentActiveDiaryId = null;

// 打开日记详情目录
function openDiaryDetail(id) {
    currentActiveDiaryId = id;
    const diary = diaryDataList.find(d => d.id === id);
    if (!diary) return;

    document.getElementById('detailDiaryTitle').innerText = diary.name;
    document.getElementById('diaryDetailModal').style.display = 'flex';
    
    renderDiaryEntries(diary);
}

function closeDiaryDetail() {
    document.getElementById('diaryDetailModal').style.display = 'none';
    currentActiveDiaryId = null;
    // 返回后刷新一下外面的主列表进度
    switchDiaryTab(document.getElementById('diaryTabActive').classList.contains('active') ? 'active' : 'archive');
}

// 渲染日记本里的内容
function renderDiaryEntries(diary) {
    const container = document.getElementById('diaryEntriesRender');
    const footer = document.getElementById('diaryActionFooter');
    container.innerHTML = '';

    if (!diary.entries || diary.entries.length === 0) {
        let firstAuthor = diary.currentTurn === 'user' ? '你' : 'TA';
        container.innerHTML = `
            <div style="background: var(--panel-bg); border: 3px dashed var(--border-color); border-radius: 8px; padding: 30px 20px; text-align: center; font-weight: 900; opacity: 0.8; margin-top: 20px;">
                <div style="font-size: 2em; margin-bottom: 10px;">📖</div>
                这是一个崭新的日记本<br>第一篇将由 <span style="color:#ff4444; font-style:italic;">${firstAuthor}</span> 来起笔！
            </div>
        `;
    } else {
        diary.entries.forEach((entry, index) => {
            const item = document.createElement('div');
            item.className = 'diary-entry-item';
            
            const authorName = entry.author === 'user' ? (currentSettings.userName || '我') : (currentSettings.charName || 'TA');
            const displayDay = Math.floor(index / 2) + 1;
            
            item.innerHTML = `
                <div class="diary-entry-header">
                    <div class="diary-entry-author">${authorName} 的日记</div>
                    <div class="diary-entry-time">DAY ${displayDay}</div>
                </div>
                <div class="diary-entry-preview">${entry.text.substring(0, 20)}...</div>
            `;
            
            // 点击阅读全篇时，把日记本ID和这篇日记的索引index传过去
            item.onclick = () => openDiaryRead(diary.id, index);
            container.appendChild(item);
        });
        
        setTimeout(() => container.scrollTop = container.scrollHeight, 50);
    }

    if (diary.isArchive) {
        footer.innerHTML = `<button class="action-btn" style="opacity:0.5; cursor:not-allowed;">这本日记已写满封存</button>`;
    } else if (diary.currentTurn === 'user') {
        footer.innerHTML = `<button class="action-btn" onclick="openDiaryWrite()">落笔写日记</button>`;
    } else {
        footer.innerHTML = `<button class="outline-btn" style="width:100%; border-style:dashed;" onclick="urgeTaDiary()">轮到TA了，戳一戳催更</button>`;
    }
}

let currentReadDiaryId = null;
let currentReadEntryIndex = -1;
let isEditingDiaryEntry = false; // 标记现在是否处于编辑状态

// 打开写日记界面 (新建模式)
function openDiaryWrite() {
    isEditingDiaryEntry = false;
    document.getElementById('diaryWriteTitle').innerText = 'WRITE DIARY';
    document.getElementById('diaryWriteInput').value = '';
    document.getElementById('diaryWriteModal').style.display = 'flex';
}

// 保存我写的日记 (涵盖新建与编辑)
async function saveDiaryEntry() {
    const text = document.getElementById('diaryWriteInput').value.trim();
    if (!text) {
        showCustomConfirm("日记内容不能为空哦！", ()=>{});
        return;
    }

    // 如果是【编辑模式】，直接修改并保存
    if (isEditingDiaryEntry) {
        const diaryToEdit = diaryDataList.find(d => d.id === currentReadDiaryId);
        diaryToEdit.entries[currentReadEntryIndex].text = text;
        
        await putToDB('settings', { key: 'diaryData', value: diaryDataList });
        document.getElementById('diaryWriteModal').style.display = 'none';
        renderDiaryEntries(diaryToEdit); // 刷新详情页
        
        // 恢复标志位
        isEditingDiaryEntry = false;
        document.getElementById('diaryWriteTitle').innerText = 'WRITE DIARY';
        return;
    }

    // 如果是【新建模式】
    const diary = diaryDataList.find(d => d.id === currentActiveDiaryId);
    if (!diary) return;

    if (!diary.entries) diary.entries = [];
    
    diary.entries.push({
        author: 'user',
        text: text,
        timestamp: Date.now()
    });

    diary.currentDay += 1;

    if (diary.currentDay >= diary.targetDays * 2) {
        diary.isArchive = true;
    } else {
        diary.currentTurn = 'char';
        diary.lastWriteTime = Date.now();
    }

    await putToDB('settings', { key: 'diaryData', value: diaryDataList });
    
    document.getElementById('diaryWriteModal').style.display = 'none';
    renderDiaryEntries(diary); 
}

// 阅读某篇日记
function openDiaryRead(diaryId, index) {
    currentReadDiaryId = diaryId;
    currentReadEntryIndex = index;
    
    const diary = diaryDataList.find(d => d.id === diaryId);
    const entry = diary.entries[index];
    
    const authorName = entry.author === 'user' ? (currentSettings.userName || '我') : (currentSettings.charName || 'TA');
    const dDate = new Date(entry.timestamp);
    const timeStr = `${dDate.getFullYear()}.${String(dDate.getMonth()+1).padStart(2,'0')}.${String(dDate.getDate()).padStart(2,'0')} ${String(dDate.getHours()).padStart(2,'0')}:${String(dDate.getMinutes()).padStart(2,'0')}`;
    
    document.getElementById('readDiaryAuthor').innerText = `作者: ${authorName}`;
    document.getElementById('readDiaryTime').innerText = timeStr;
    document.getElementById('readDiaryText').innerText = entry.text;
    document.getElementById('diaryReadModal').style.display = 'flex';
}

// 【新增】编辑当前正在阅读的这篇日记
function editCurrentEntry() {
    const diary = diaryDataList.find(d => d.id === currentReadDiaryId);
    const entry = diary.entries[currentReadEntryIndex];
    
    isEditingDiaryEntry = true;
    document.getElementById('diaryWriteTitle').innerText = 'EDIT ENTRY (编辑)';
    document.getElementById('diaryWriteInput').value = entry.text;
    
    document.getElementById('diaryReadModal').style.display = 'none';
    document.getElementById('diaryWriteModal').style.display = 'flex';
}

// 【新增】撕掉(删除)当前正在阅读的这篇日记
async function deleteCurrentEntry() {
    showCustomConfirm('确定要撕掉这篇日记吗？', async () => {
        const diary = diaryDataList.find(d => d.id === currentReadDiaryId);
        
        // 删掉这条数据
        diary.entries.splice(currentReadEntryIndex, 1);
        
        // 智能回退日记天数和状态
        diary.currentDay = diary.entries.length;
        
        // 判断是否因为撕掉一篇，导致这本封存的日记重新变为“进行中”
        diary.isArchive = diary.currentDay >= diary.targetDays * 2;
        
        // 智能回退回合：看看剩下最后一篇是谁写的，把笔交给另外一个人
        if (diary.entries.length > 0) {
            diary.currentTurn = diary.entries[diary.entries.length - 1].author === 'user' ? 'char' : 'user';
        } else {
            // 如果撕光了，把笔交给你
            diary.currentTurn = 'user';
        }
        
        await putToDB('settings', { key: 'diaryData', value: diaryDataList });
        document.getElementById('diaryReadModal').style.display = 'none';
        renderDiaryEntries(diary); // 刷新详情目录
    });
}

// 【新增】彻底销毁整本交换日记本
async function deleteCurrentDiary() {
    if (!currentActiveDiaryId) return;
    showCustomConfirm('确定要彻底销毁这本日记吗？所有的回忆都将消失哦！', async () => {
        diaryDataList = diaryDataList.filter(d => d.id !== currentActiveDiaryId);
        await putToDB('settings', { key: 'diaryData', value: diaryDataList });
        
        // 返回主界面并刷新
        closeDiaryDetail();
    });
}

// 生成 TA 的智能拼接日记内容
async function generateTaDiaryContent(diaryChatId) {
    const allWords = await getAllFromDB('wordCards');
    if (!allWords || allWords.length === 0) return "（拿起笔，想记录些什么，却不知道该从何说起呢……）";

    let validWords = allWords;
    let activeChar = charactersList.find(c => c.id === (diaryChatId || currentChatId));
    let charReplyGroups = activeChar ? (activeChar.activeReplyGroups || currentSettings.activeReplyGroups) : currentSettings.activeReplyGroups;

    if(charReplyGroups && charReplyGroups.length > 0) {
        validWords = allWords.filter(w => charReplyGroups.includes(w.category || '日常'));
    }
    if (validWords.length === 0) validWords = allWords; // 兜底防空

    // 随机抽取 5 到 20 条片段
    const spliceCount = Math.floor(Math.random() * 16) + 5; 
    let text = "";

    for (let i = 0; i < spliceCount; i++) {
        let snippet = validWords[Math.floor(Math.random() * validWords.length)].text.trim();
        
        // 检查这段话结尾是不是已经带了标点
        let hasPunc = false;
        const lastChar = snippet.slice(-1);
        if (['。', '！', '？', '，', '…', '!', '?', ',', '.'].includes(lastChar)) {
            hasPunc = true;
        }

        if (i === spliceCount - 1) {
            // 最后一句收尾处理
            if (!hasPunc) {
                const r = Math.random();
                if (r < 0.6) snippet += '。';
                else if (r < 0.8) snippet += '！';
                else snippet += '……';
            } else if (lastChar === '，' || lastChar === ',') {
                // 如果最后一句结尾是逗号，强行改回句号结束
                snippet = snippet.slice(0, -1) + '。';
            }
        } else {
            // 中间的句子加各种符号
            if (!hasPunc) {
                const r = Math.random();
                if (r < 0.6) snippet += '，';
                else if (r < 0.8) snippet += '。';
                else if (r < 0.9) snippet += '？';
                else snippet += '！';
            }
        }
        text += snippet;
    }
    return text;
}

// ================= 交换日记：定时持久化引擎 =================
let diaryWriteTimers = {};

// 统一执行 TA 写日记的动作
async function executeTaDiaryWrite(diaryId) {
    const freshData = await getFromDB('settings', 'diaryData');
    let currentList = freshData ? freshData.value : [];
    let dToUpdate = currentList.find(d => d.id === diaryId);

    // 再次确认本子没被封存，且确实在 TA 手里
    if (dToUpdate && !dToUpdate.isArchive && dToUpdate.currentTurn === 'char' && dToUpdate.nextWriteTime) {
        const taText = await generateTaDiaryContent(dToUpdate.chatId);
        
        dToUpdate.entries.push({
            author: 'char',
            text: taText,
            timestamp: Date.now()
        });
        dToUpdate.currentDay += 1;
        
        if (dToUpdate.currentDay >= dToUpdate.targetDays * 2) {
    dToUpdate.isArchive = true;
} else {
            dToUpdate.currentTurn = 'user'; // 交还给你
        }
        
        dToUpdate.nextWriteTime = null; // 清理掉时间标记
        await putToDB('settings', { key: 'diaryData', value: currentList });
        
        let cName = currentSettings.charName || "TA";
        await saveAndRenderMsg('system', `${cName} 已悄悄在《${dToUpdate.name}》里写下了一篇新日记`, null, Date.now(), true);
    }
}

// 全局扫描：检查有没有到点该写、或错过时间的日记
async function checkPendingDiaryTasks() {
    const diaryData = await getFromDB('settings', 'diaryData');
    let dList = diaryData ? diaryData.value : [];
    const now = Date.now();
    
    dList.forEach(d => {
        if (d.nextWriteTime && !d.isArchive && d.currentTurn === 'char') {
            if (diaryWriteTimers[d.id]) clearTimeout(diaryWriteTimers[d.id]);
            
            if (now >= d.nextWriteTime) {
                // 如果时间已经过了（比如你关了网页刚打开），立刻补写！
                executeTaDiaryWrite(d.id);
            } else {
                // 时间还没到，挂载精准定时器
                diaryWriteTimers[d.id] = setTimeout(() => executeTaDiaryWrite(d.id), d.nextWriteTime - now);
            }
        }
    });
}

// 催更逻辑 (带预计时间回应 + 持久化)
async function urgeTaDiary() {
    const diary = diaryDataList.find(d => d.id === currentActiveDiaryId);
    if (!diary) return;

    // 智能计算时间：如果是新建的还没写过，就用创建时间；写过了就用最后一次落笔时间
    let passedSeconds = 0;
    if (diary.lastWriteTime === 0) {
        const createTime = parseInt(diary.id.split('_')[1]);
        passedSeconds = (Date.now() - createTime) / 1000;
    } else {
        passedSeconds = (Date.now() - diary.lastWriteTime) / 1000;
    }
    
    // 如果 10 秒内连续点，TA 会傲娇拒绝
    if (passedSeconds < 10) {
        // 智能文案判定
        let rejectMsg = diary.entries.length === 0 
            ? 'TA：喂！本子才刚建好，我还没想好第一篇写什么呢，不许催！' 
            : 'TA：喂！笔才刚交给我，我还没想好怎么写呢，不许催！';

        // 生成居中、带漫画风阴影的高级弹窗
        let t = document.createElement('div');
        t.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:var(--text-color); color:var(--bg-color); padding:15px 25px; border-radius:8px; font-weight:900; font-size:1em; z-index:999999; opacity:0; transition:opacity 0.2s; pointer-events:none; box-shadow: 4px 4px 0 var(--border-color); text-align:center; width: 75%; max-width: 300px;';
        t.innerText = rejectMsg;
        document.body.appendChild(t);
        setTimeout(()=>t.style.opacity='1', 10);
        setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 2500);
        return;
    }

    diary.lastWriteTime = Date.now();

    document.getElementById('diaryDetailModal').style.display = 'none';
    document.getElementById('diaryModal').style.display = 'none';
    currentActiveDiaryId = null;

    // 发送催更卡片
    const urgeQuotes = [
        "该你落笔啦，今天有什么趣事吗？", 
        "日记本交给你咯，快写快写~", 
        "静候你的交换日记回音。", 
        "今天轮到你来记录啦！",
        "笔给你，写点什么吧~"
    ];
    const randomQuote = urgeQuotes[Math.floor(Math.random() * urgeQuotes.length)];

    const htmlStr = `
        <div class="checkin-chat-card" style="border-style: solid;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 2px;">
                <div style="font-weight:900; font-size:1.15em; letter-spacing:1px; line-height:1.3; max-width: 75%;">
                    <span style="font-size:0.7em; background:var(--text-color); color:var(--bg-color); padding:2px 4px; border-radius:4px; vertical-align:middle; margin-right:4px;">催更</span>
                    <br/>日记本：${diary.name}
                </div>
                <div style="color: var(--text-color); opacity: 0.9; padding-top: 4px;">
                    <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </div>
            </div>
            <div style="font-size:0.85em; font-weight:900; font-style:italic; margin-top:4px; opacity:0.8;">“${randomQuote}”</div>
        </div>
    `;

    const qData = currentQuoteData; clearQuote();
    await saveAndRenderMsg('user', htmlStr, null, Date.now(), true, null, qData);
    if (!isBatchMode) simulateReadAndReply();

    // 计算延迟时间和回应话语
    const roll = Math.random();
    let delayMs = 0;
    let hintText = "";
    
    if (roll < 0.4) {
        delayMs = Math.random() * 5000 + 3000;
        hintText = "TA 回应：马上就写！等我几秒钟~";
    } else if (roll < 0.7) {
        delayMs = Math.random() * 90000 + 30000;
        let mins = Math.ceil(delayMs / 60000);
        hintText = `TA 回应：知道啦，大概 ${mins} 分钟后写！`;
    } else {
        delayMs = Math.random() * 1500000 + 300000;
        let mins = Math.ceil(delayMs / 60000);
        hintText = `TA 回应：现在不想写，过个 ${mins} 分钟再说吧~`;
    }

    // 悬浮提示 TA 的回应
    let t = document.createElement('div');
    t.style.cssText = 'position:fixed; bottom:120px; left:50%; transform:translateX(-50%); background:var(--text-color); color:var(--bg-color); padding:8px 16px; border-radius:20px; font-weight:900; font-size:0.9em; z-index:999999; opacity:0; transition:opacity 0.3s; pointer-events:none; box-shadow:0 4px 10px rgba(0,0,0,0.2); white-space:nowrap;';
    t.innerText = hintText;
    document.body.appendChild(t);
    setTimeout(()=>t.style.opacity='1', 10);
    setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 3500);

    // 将目标时间永久写入数据库！
    diary.nextWriteTime = Date.now() + delayMs;
    await putToDB('settings', { key: 'diaryData', value: diaryDataList });

    // 激活后台检查器
    checkPendingDiaryTasks();
}

// 自动随机触发 (35%主动写，20%主动催)
async function autoCheckDiaryToWrite() {
    const diaryData = await getFromDB('settings', 'diaryData');
    let dList = diaryData ? diaryData.value : [];
    if (dList.length === 0) return;

    let targetDiary = dList.find(d => !d.isArchive && (!d.chatId || d.chatId === currentChatId));
    if (!targetDiary) return;

    if (targetDiary.currentTurn === 'char' && !targetDiary.nextWriteTime) {
        if (Math.random() < 0.35) {
            let delayMs = Math.random() * 15000 + 5000; 
            targetDiary.nextWriteTime = Date.now() + delayMs;
            await putToDB('settings', { key: 'diaryData', value: dList });
            checkPendingDiaryTasks(); // 激活调度器
        }
    } 
    else if (targetDiary.currentTurn === 'user') {
        let todayStr = new Date().toLocaleDateString();
        if (targetDiary.lastUrgedUserDate !== todayStr) {
            if (Math.random() < 0.20) { 
                targetDiary.lastUrgedUserDate = todayStr;
                await putToDB('settings', { key: 'diaryData', value: dList });

                const taUrgeQuotes = [
                    "该你写日记啦，别偷懒！", "日记本还在你手里呢，快点动笔~",
                    "今天发生了什么？快写下来给我看！", "等你的日记等得花儿都要谢了...",
                    "别忘了我们的交换日记之约哦！"
                ];
                const randomQuote = taUrgeQuotes[Math.floor(Math.random() * taUrgeQuotes.length)];

                const htmlStr = `
                    <div class="checkin-chat-card" style="border-style: solid;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 2px;">
                            <div style="font-weight:900; font-size:1.15em; letter-spacing:1px; line-height:1.3; max-width: 75%;">
                                <span style="font-size:0.7em; background:var(--text-color); color:var(--bg-color); padding:2px 4px; border-radius:4px; vertical-align:middle; margin-right:4px;">催更</span>
                                <br/>日记本：${targetDiary.name}
                            </div>
                            <div style="color: var(--text-color); opacity: 0.9; padding-top: 4px;">
                                <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </div>
                        </div>
                        <div style="font-size:0.85em; font-weight:900; font-style:italic; margin-top:4px; opacity:0.8;">“${randomQuote}”</div>
                    </div>
                `;
                setTimeout(async () => {
                    let activeChar = charactersList.find(c => c.id === currentChatId) || charactersList[0];
                    await saveAndRenderMsg('yume', htmlStr, null, Date.now(), true, activeChar);
                }, 1500);
            }
        }
    }
}

// ================= 紧急救援：连点7次屏幕任意位置恢复默认主题 =================
let rescueClickCount = 0;
let rescueClickTimer = null;

// 改用 click，完美避开滑动！滑动不会触发 click 事件。
document.addEventListener('click', (e) => {
    // 排除按钮、输入框等正常交互元素
    if(e.target.closest('button') || e.target.closest('.icon-btn') || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    rescueClickCount++;
    if (rescueClickTimer) clearTimeout(rescueClickTimer);
    
    if (rescueClickCount >= 7) { // 提高到 7 次
        rescueClickCount = 0;
        if (confirm("【系统急救】检测到极速连续点击 7 次！是否要清空所有自定义主题和排版，恢复到默认状态？（放心，不会删除你的聊天记录和角色数据）")) {
            
            // 清除所有的美化主题设置
            currentSettings.themeStyle = 'default';
            currentSettings.headerStyle = 'default';
            currentSettings.inputPresetCss = '';
            currentSettings.bubblePresetCss = '';
            currentSettings.bubbleCss = '';
            currentSettings.themeCss = '';
            
            // 存入数据库并刷新
            putToDB('settings', { key: 'config', value: currentSettings }).then(() => {
                alert("已成功恢复默认排版！即将刷新页面...");
                location.reload();
            });
        }
    } else {
        // 时间缩短到 400 毫秒，必须点得极快才能连击成功
        rescueClickTimer = setTimeout(() => {
            rescueClickCount = 0;
        }, 400); 
    }
}, { passive: true });

/* ================= 记忆时光机 (聊天搜索系统) ================= */

function openSearchModal() {
    document.getElementById('appPanel').style.display = 'none'; // 收起悬浮球面板
    document.getElementById('searchModal').style.display = 'flex';
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResultsRender').innerHTML = '<div style="text-align:center; opacity:0.5; font-weight:900; padding:40px 0; font-style:italic;">请在上方输入关键词检索聊天记忆...</div>';
    setTimeout(() => document.getElementById('searchInput').focus(), 100);
}

function closeSearchModal() {
    document.getElementById('searchModal').style.display = 'none';
}

let searchDebounceTimer;
// 增加防抖，打字时不会卡顿
function debounceSearch() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(performSearch, 300);
}

function performSearch() {
    const kw = document.getElementById('searchInput').value.trim().toLowerCase();
    const container = document.getElementById('searchResultsRender');
    const filter = document.querySelector('input[name="searchFilter"]:checked').value;

    if (!kw) {
        container.innerHTML = '<div style="text-align:center; opacity:0.5; font-weight:900; padding:40px 0; font-style:italic;">请在上方输入关键词检索聊天记忆...</div>';
        return;
    }

    // 过滤出当前房间的聊天记录
    const roomMsgs = allMessagesCache.filter(m => (!m.chatId && currentChatId === 'default') || m.chatId === currentChatId);
    
    const results = [];
    for (let i = 0; i < roomMsgs.length; i++) {
        const m = roomMsgs[i];
        if (!m.text) continue;
        
        // 发送者条件过滤
        if (filter === 'yume' && m.sender !== 'yume') continue;
        if (filter === 'user' && m.sender !== 'user') continue;

        // 剔除复杂的分享卡片代码，只搜索纯文本
        let cleanText = m.text.replace(/<[^>]+>/g, '').trim();

        if (cleanText.toLowerCase().includes(kw)) {
            results.push({
                msg: m,
                cleanText: cleanText,
                prev: i > 0 ? roomMsgs[i - 1] : null,
                next: i < roomMsgs.length - 1 ? roomMsgs[i + 1] : null
            });
        }
    }

    if (results.length === 0) {
        container.innerHTML = '<div style="text-align:center; opacity:0.5; font-weight:900; padding:40px 0; font-style:italic;">记忆深处没有找到这句话...</div>';
        return;
    }

    // 倒序：最新的记忆排在最上面
    results.reverse();

    let html = `<div style="text-align:center; font-size:0.85em; font-weight:900; opacity:0.6; margin-bottom: 5px;">找到了 ${results.length} 块记忆碎片<br>(点击卡片可查看时光上下文)</div>`;
    
    results.forEach(res => {
        const d = new Date(res.msg.timestamp);
        const timeStr = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        
        const senderName = res.msg.sender === 'user' ? (currentSettings.userName || '我') : (res.msg.charName || currentSettings.charName || 'TA');
        
// 处理关键词高亮 (增加安全转义，防止搜标点符号报错)
        const safeKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${safeKw})`, 'gi');
        const highlighted = res.cleanText.replace(regex, `<span class="search-highlight">$1</span>`);

        // 构建“时光回溯”上下文（上一句和下一句）
        let contextHtml = '';
        if (res.prev && res.prev.text) {
            let pName = res.prev.sender === 'user' ? '我' : 'TA';
            let pText = res.prev.text.replace(/<[^>]+>/g, '').substring(0, 30);
            contextHtml += `<div style="opacity:0.7;"><span style="font-weight:900;">${pName}:</span> ${pText || '[图片/卡片]'}</div>`;
        }
        if (res.next && res.next.text) {
            let nName = res.next.sender === 'user' ? '我' : 'TA';
            let nText = res.next.text.replace(/<[^>]+>/g, '').substring(0, 30);
            contextHtml += `<div style="opacity:0.7;"><span style="font-weight:900;">${nName}:</span> ${nText || '[图片/卡片]'}</div>`;
        }
        
        if (!contextHtml) contextHtml = '<div style="opacity:0.5; text-align:center;">这是第一句/最后一句，没有更多上下文了</div>';

        // 渲染卡片：修复手机端点击报错的问题，并将间距调大防止挤压
        html += `
            <div class="search-result-card" onclick="var ctx = this.querySelector('.search-context-box'); ctx.style.display = (ctx.style.display === 'flex' ? 'none' : 'flex');">
                <div style="display:flex; justify-content:space-between; margin-bottom: 8px; font-size:0.8em; opacity:0.6; font-weight:bold; padding-left:4px;">
                    <span>${senderName}</span>
                    <span>${timeStr}</span>
                </div>
                <div style="font-weight:900; line-height: 1.5; word-break: break-all; padding-left:4px; margin-bottom: 4px;">${highlighted}</div>
                
                <div class="search-context-box">
                    <div style="font-size:0.8em; font-style:italic; font-weight:900; border-bottom:1px solid var(--border-color); padding-bottom:4px; margin-bottom:4px;">时光回溯</div>
                    ${contextHtml}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

/* ================= 抉择功能 (完整外观 + 历史记录) ================= */
window.openChoiceModal = function() {
    document.getElementById('appPanel').style.display = 'none';
    document.getElementById('choiceQuestionInput').value = '';
    document.getElementById('choiceOptionsInput').value = '';
    document.getElementById('choiceModal').style.display = 'flex';
};

window.openChoiceHistory = async function() {
    document.getElementById('choiceModal').style.display = 'none';
    document.getElementById('choiceHistoryModal').style.display = 'flex';
    const box = document.getElementById('choiceHistoryList');
    const data = await getFromDB('settings', 'choiceHistoryData');
    const list = data ? [...data.value].reverse() : [];
    
    if (list.length === 0) {
        box.innerHTML = '<div style="text-align:center; padding:40px; opacity:0.5; font-weight:900;">还没有历史记录哦~</div>';
        return;
    }
    
    box.innerHTML = list.map(r => `
        <div style="background:var(--panel-bg); border:3px solid var(--border-color); padding:12px; border-radius:8px; box-shadow: 3px 3px 0 var(--border-color); margin-bottom:12px; display:flex; flex-direction:column; gap:6px;">
            <div style="font-size:0.75em; opacity:0.6; font-weight:bold; display:flex; justify-content:space-between;">
                <span>${r.mode === 'single' ? '单选' : '多选'}</span>
                <span>${r.time}</span>
            </div>
            <div style="font-weight:900; font-size:1.05em;">Q: ${r.question}</div>
            <div style="font-size:0.9em; font-weight:900; color:#4CAF50; margin-top:4px;">TA 的抉择：</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                ${r.aiChoices.map(c => `<span style="background:var(--text-color); color:var(--bg-color); padding:4px 8px; border-radius:4px; font-weight:900; font-size:0.9em;">${c}</span>`).join(' ')}
            </div>
        </div>
    `).join('');
};

window.sendChoiceToChat = async function() {
    const question = document.getElementById('choiceQuestionInput').value.trim();
    const optionsText = document.getElementById('choiceOptionsInput').value.trim();
    const mode = document.getElementById('choiceModeSelect').value;
    
    if (!question || !optionsText) return showCustomConfirm('问题和选项不能为空哦！', ()=>{});
    const options = optionsText.split('\n').map(o => o.trim()).filter(o => o.length > 0);
    if (options.length < 2) return showCustomConfirm('至少需要 2 个选项哦！', ()=>{});

    document.getElementById('choiceModal').style.display = 'none';
    const choiceId = 'choice_' + Date.now();
    
    // 完美保留原版外观的卡片
    const optionsHtml = options.map((opt, index) => `<div class="choice-opt-btn" id="opt_${choiceId}_${index}" style="font-size:0.95em; font-weight:bold; color:var(--text-color); background:var(--bg-color); padding:10px 12px; border-radius:8px; border:2px solid var(--border-color); text-align:center; cursor:default;">${opt}</div>`).join('');

    const htmlStr = `
        <div class="choice-chat-card" id="${choiceId}" style="background: var(--panel-bg); border: 3px dashed var(--border-color); border-radius: 12px; padding: 15px; display: flex; flex-direction: column; gap: 10px; width: 100%; min-width: 220px;">
            <div style="font-weight:900; font-size:1.1em; color:var(--text-color); border-bottom:2px dashed var(--border-color); padding-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                <span>🤔 抉择</span>
                <span style="font-size:0.7em; background:var(--text-color); color:var(--bg-color); padding:2px 6px; border-radius:4px;">${mode === 'single' ? '单选' : '多选'}</span>
            </div>
            <div style="font-weight:900; font-size:1.05em; color:var(--text-color); line-height: 1.4;">${question}</div>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:6px;" id="opts_container_${choiceId}">
                ${optionsHtml}
            </div>
            <div id="tip_${choiceId}" style="font-size:0.75em; opacity:0.5; font-style:italic; margin-top:4px; text-align:center;">等待 TA 做出选择...</div>
        </div>
    `;
    
    const qData = currentQuoteData; clearQuote();
    await saveAndRenderMsg('user', htmlStr, null, Date.now(), true, null, qData);
    if (!isBatchMode) simulateReadAndReply();
    
    // 极简 AI 回复逻辑
    const originalSimulateReadAndReply = simulateReadAndReply;
    simulateReadAndReply = async function() {
        await originalSimulateReadAndReply(); 
      const waitS = currentSettings.choiceDelay !== undefined ? currentSettings.choiceDelay : 3;
await delay(waitS * 1000);
        
        let selectedIndices = mode === 'single' ? [Math.floor(Math.random() * options.length)] : [...Array(options.length).keys()].sort(() => 0.5 - Math.random()).slice(0, Math.min(Math.floor(Math.random() * 2) + 2, options.length));
        let aiChoicesText = [];

        selectedIndices.forEach(idx => {
            const btn = document.getElementById(`opt_${choiceId}_${idx}`);
            if (btn) {
                btn.style.background = "var(--text-color)";
                btn.style.color = "var(--bg-color)";
                btn.style.borderColor = "var(--text-color)";
                btn.innerHTML = "✓ " + btn.innerText;
                aiChoicesText.push(options[idx]);
            }
        });
        
        const tipEl = document.getElementById(`tip_${choiceId}`);
        if (tipEl) { tipEl.innerHTML = `<span style="color:#4CAF50; font-weight:900;">TA 已做出选择 🔒</span>`; tipEl.style.opacity = "1"; }

        const historyData = await getFromDB('settings', 'choiceHistoryData');
        let list = historyData ? historyData.value : [];
        list.push({ question, options, mode, aiChoices: aiChoicesText, time: new Date().toLocaleString() });
        await putToDB('settings', { key: 'choiceHistoryData', value: list });
        simulateReadAndReply = originalSimulateReadAndReply;
    };
};

/* ================= 联网系统（含侧边栏入口） ================= */
let supabaseClient = null;
const chatSyncedIds = new Set();
let currentRoomId = 'default';

function initSupabaseSafe() {
    try {
        const SUPABASE_URL = 'https://jscpubblvsbodiawgsem.supabase.co';
        const SUPABASE_ANON_KEY = '把你那串 eyJ 开头的长乱码填在这里';  // 👈 只有这里要你填
        if (typeof supabase === 'undefined') return;
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
        supabaseClient = null;
    }
}

async function initChatSystem() {
    initSupabaseSafe();
    if (!supabaseClient) return;

    let MY_USER_ID = localStorage.getItem('my_user_id');
    if (!MY_USER_ID) {
        MY_USER_ID = 'u_' + Math.random().toString(36).substr(2, 6);
        localStorage.setItem('my_user_id', MY_USER_ID);
    }
    window.MY_USER_ID = MY_USER_ID;

    const idEl = document.getElementById('myIdDisplay');
    if(idEl) idEl.innerText = MY_USER_ID;
    const inputEl = document.getElementById('customIdInput');
    if(inputEl) inputEl.value = MY_USER_ID;

    try {
        await supabaseClient.from('users').upsert([{ id: MY_USER_ID, name: '我' }]);
        supabaseClient.channel('chat-room-rt')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_chat' },
                (payload) => handleIncomingChatRow(payload.new)).subscribe();
        switchRoom('default');
    } catch(e) { console.error(e); }
}

// —— 发送拦截 ——
const originalSendMessage = window.sendMessage;
window.sendMessage = function() {
    if (currentRoomId === 'default' || !supabaseClient) {
        originalSendMessage(); 
    } else {
        const input = document.getElementById('messageInput');
        const text = input.innerText.trim();
        if (!text) return;
        sendChatMsg(window.MY_USER_ID, '我', text, null);
        input.innerText = '';
    }
};

function appendChatMessageLocal(row) {
    const container = document.getElementById('chatContainer');
    if (!container) return;
    const cssSender = (row.sender_id === window.MY_USER_ID) ? 'user' : 'yume';
    const el = createMessageElement(cssSender, row.content, row.img_url, row.ts, true, true, { charName: row.sender_name });
    container.appendChild(el);
    scrollToBottom(false);
}

async function sendChatMsg(senderId, senderName, content, imgUrl = null) {
    const ts = Date.now();
    const clientId = `${senderId}_${ts}_${Math.floor(Math.random()*100000)}`;
    appendChatMessageLocal({ client_id: clientId, sender_id: senderId, sender_name: senderName, content: content, img_url: imgUrl, ts: ts });
    chatSyncedIds.add(clientId);
    await supabaseClient.from('group_chat').insert([{
        client_id: clientId, sender_id: senderId, sender_name: senderName,
        content: content || '', img_url: imgUrl, ts: ts, room_id: currentRoomId
    }]);
}

function handleIncomingChatRow(row) {
    if (!row || !row.client_id) return;
    if (row.room_id !== currentRoomId) return;
    if (chatSyncedIds.has(row.client_id)) return;
    if (row.sender_id === window.MY_USER_ID) return;
    chatSyncedIds.add(row.client_id);
    appendChatMessageLocal(row);
}

async function switchRoom(roomId) {
    if (!supabaseClient) return alert("未连接到服务器");
    currentRoomId = roomId;
    document.getElementById('chatContainer').innerHTML = ''; 
    document.getElementById('yumeTitle').innerText = roomId === 'default' ? '私密单聊' : '四人小群';
    const { data } = await supabaseClient.from('group_chat')
        .select('*').eq('room_id', roomId).order('ts', { ascending: true }).limit(100);
    if (data) data.forEach(row => { chatSyncedIds.add(row.client_id); appendChatMessageLocal(row); });
    document.getElementById('netPanelModal').style.display = 'none';
}

async function promptAddFriend() {
    if (!supabaseClient) return alert("未连接到服务器");
    const fid = prompt("请输入朋友的ID：");
    if (fid) {
        await supabaseClient.from('friends').insert([{ user_id: window.MY_USER_ID, friend_id: fid }]);
        alert('已添加！');
    }
}

async function changeMyId() {
    if (!supabaseClient) return alert("未连接到服务器");
    const newId = document.getElementById('customIdInput').value.trim();
    if (!newId) return alert("ID不能为空！");
    window.MY_USER_ID = newId;
    localStorage.setItem('my_user_id', window.MY_USER_ID);
    document.getElementById('myIdDisplay').innerText = window.MY_USER_ID;
    await supabaseClient.from('users').upsert([{ id: window.MY_USER_ID, name: '我' }]);
    alert("ID已修改！");
}

// 👇 侧边栏联机按钮的弹窗开关
function openNetPanel() {
    document.getElementById('netPanelModal').style.display = 'flex';
}

setTimeout(() => initChatSystem(), 2000);