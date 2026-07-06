'use strict';
/* ============================================================
   I18n — interface translation.

   The app's templates are written in English. Rather than thread
   a t() call through every string, this layer walks the rendered
   DOM after each change and swaps any text (or placeholder/title)
   that exactly matches an English key in the dictionary below.

   • Anything not in the dictionary stays English (graceful
     fallback) — so the app is never broken, only more or less
     translated.
   • User data (names, numbers, emails, brand text) never matches
     a key, so it is left untouched.
   • Language is stored per-device in localStorage.

   To extend a language, add "English source": "translation" pairs
   to its block. Keys must match the app text exactly.
   ============================================================ */

const I18n = (() => {
  const KEY = 'fitcheck_lang';

  // The 12 curated languages (hand-translated, instant, offline) sit at the
  // top. Everything below is translated live on first use, then cached on the
  // device. Codes are Google Translate codes.
  const LANGS = [
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'zh', label: '中文 (简体)' },
    { code: 'hi', label: 'हिन्दी' },
    { code: 'ar', label: 'العربية' },
    { code: 'pt', label: 'Português' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'ru', label: 'Русский' },
    { code: 'ja', label: '日本語' },
    { code: 'it', label: 'Italiano' },
    { code: 'sv', label: 'Svenska' },
    { code: 'af', label: 'Afrikaans' }, { code: 'sq', label: 'Albanian' },
    { code: 'am', label: 'Amharic' }, { code: 'hy', label: 'Armenian' },
    { code: 'az', label: 'Azerbaijani' }, { code: 'eu', label: 'Basque' },
    { code: 'be', label: 'Belarusian' }, { code: 'bn', label: 'Bengali' },
    { code: 'bs', label: 'Bosnian' }, { code: 'bg', label: 'Bulgarian' },
    { code: 'my', label: 'Burmese' }, { code: 'ca', label: 'Catalan' },
    { code: 'ceb', label: 'Cebuano' }, { code: 'ny', label: 'Chichewa' },
    { code: 'zh-TW', label: 'Chinese (Traditional)' }, { code: 'co', label: 'Corsican' },
    { code: 'hr', label: 'Croatian' }, { code: 'cs', label: 'Czech' },
    { code: 'da', label: 'Danish' }, { code: 'nl', label: 'Dutch' },
    { code: 'eo', label: 'Esperanto' }, { code: 'et', label: 'Estonian' },
    { code: 'tl', label: 'Filipino' }, { code: 'fi', label: 'Finnish' },
    { code: 'fy', label: 'Frisian' }, { code: 'gl', label: 'Galician' },
    { code: 'ka', label: 'Georgian' }, { code: 'el', label: 'Greek' },
    { code: 'gu', label: 'Gujarati' }, { code: 'ht', label: 'Haitian Creole' },
    { code: 'ha', label: 'Hausa' }, { code: 'haw', label: 'Hawaiian' },
    { code: 'iw', label: 'Hebrew' }, { code: 'hmn', label: 'Hmong' },
    { code: 'hu', label: 'Hungarian' }, { code: 'is', label: 'Icelandic' },
    { code: 'ig', label: 'Igbo' }, { code: 'id', label: 'Indonesian' },
    { code: 'ga', label: 'Irish' }, { code: 'jw', label: 'Javanese' },
    { code: 'kn', label: 'Kannada' }, { code: 'kk', label: 'Kazakh' },
    { code: 'km', label: 'Khmer' }, { code: 'rw', label: 'Kinyarwanda' },
    { code: 'ko', label: '한국어 (Korean)' }, { code: 'ku', label: 'Kurdish' },
    { code: 'ky', label: 'Kyrgyz' }, { code: 'lo', label: 'Lao' },
    { code: 'la', label: 'Latin' }, { code: 'lv', label: 'Latvian' },
    { code: 'lt', label: 'Lithuanian' }, { code: 'lb', label: 'Luxembourgish' },
    { code: 'mk', label: 'Macedonian' }, { code: 'mg', label: 'Malagasy' },
    { code: 'ms', label: 'Malay' }, { code: 'ml', label: 'Malayalam' },
    { code: 'mt', label: 'Maltese' }, { code: 'mi', label: 'Maori' },
    { code: 'mr', label: 'Marathi' }, { code: 'mn', label: 'Mongolian' },
    { code: 'ne', label: 'Nepali' }, { code: 'no', label: 'Norwegian' },
    { code: 'or', label: 'Odia (Oriya)' }, { code: 'ps', label: 'Pashto' },
    { code: 'fa', label: 'فارسی (Persian)' }, { code: 'pl', label: 'Polish' },
    { code: 'pa', label: 'Punjabi' }, { code: 'ro', label: 'Romanian' },
    { code: 'sm', label: 'Samoan' }, { code: 'gd', label: 'Scots Gaelic' },
    { code: 'sr', label: 'Serbian' }, { code: 'st', label: 'Sesotho' },
    { code: 'sn', label: 'Shona' }, { code: 'sd', label: 'Sindhi' },
    { code: 'si', label: 'Sinhala' }, { code: 'sk', label: 'Slovak' },
    { code: 'sl', label: 'Slovenian' }, { code: 'so', label: 'Somali' },
    { code: 'su', label: 'Sundanese' }, { code: 'sw', label: 'Swahili' },
    { code: 'tg', label: 'Tajik' }, { code: 'ta', label: 'Tamil' },
    { code: 'tt', label: 'Tatar' }, { code: 'te', label: 'Telugu' },
    { code: 'th', label: 'Thai' }, { code: 'tr', label: 'Turkish' },
    { code: 'tk', label: 'Turkmen' }, { code: 'uk', label: 'Ukrainian' },
    { code: 'ur', label: 'اردو (Urdu)' }, { code: 'ug', label: 'Uyghur' },
    { code: 'uz', label: 'Uzbek' }, { code: 'vi', label: 'Tiếng Việt' },
    { code: 'cy', label: 'Welsh' }, { code: 'xh', label: 'Xhosa' },
    { code: 'yi', label: 'Yiddish' }, { code: 'yo', label: 'Yoruba' },
    { code: 'zu', label: 'Zulu' }
  ];

  // curated codes have a full offline dictionary (defined below)
  const CURATED = { es: 1, zh: 1, hi: 1, ar: 1, pt: 1, fr: 1, de: 1, ru: 1, ja: 1, it: 1, sv: 1 };
  const RTL = { ar: 1, iw: 1, fa: 1, ur: 1, ps: 1, sd: 1, ug: 1, yi: 1 };

  const DICT = {
    es: {
      'Home': 'Inicio', 'Analyze': 'Analizar', 'Profiles': 'Perfiles', 'History': 'Historial',
      'For you': 'Para ti', 'Help': 'Ayuda', 'Settings': 'Ajustes',
      "Who's wearing it": 'Quién lo lleva', 'The garment': 'La prenda', 'Verdict': 'Veredicto',
      'Continue': 'Continuar', 'Back': 'Atrás', 'Cancel': 'Cancelar', 'Delete': 'Eliminar', 'Remove': 'Quitar',
      'Log in': 'Iniciar sesión', 'Log out': 'Cerrar sesión', 'Take my measure': 'Tomar mis medidas',
      'Get the verdict': 'Ver el veredicto', 'On to the garment': 'A la prenda', 'Save & continue': 'Guardar y continuar',
      'Check another garment': 'Analizar otra prenda', 'Change password': 'Cambiar contraseña', 'Update password': 'Actualizar contraseña',
      'Account': 'Cuenta', 'Units': 'Unidades', 'Language': 'Idioma', 'Privacy & data': 'Privacidad y datos',
      'Centimetres (cm)': 'Centímetros (cm)', 'Inches (in)': 'Pulgadas (in)', 'Install FitCheck': 'Instalar FitCheck',
      'Garment type': 'Tipo de prenda', 'How do you like it to fit?': '¿Cómo te gusta que quede?',
      'Slim / fitted': 'Ajustado', 'Regular': 'Normal', 'Relaxed / oversized': 'Holgado',
      'Female or male sizing?': '¿Tallaje de mujer o de hombre?', 'Female': 'Mujer', 'Male': 'Hombre',
      'Profile name': 'Nombre del perfil', 'Profile': 'Perfil', 'Current password': 'Contraseña actual', 'New password': 'Nueva contraseña',
      'Height': 'Altura', 'Weight': 'Peso', 'Chest / Bust': 'Pecho / Busto', 'Waist': 'Cintura', 'Hips': 'Cadera',
      'Shoulder width': 'Ancho de hombros', 'Arm length': 'Largo de brazo', 'Inseam': 'Entrepierna', 'Thigh': 'Muslo',
      'Chest': 'Pecho', 'Shoulders': 'Hombros', 'Sleeve length': 'Largo de manga', 'Garment length': 'Largo de la prenda',
      'good fit': 'buen ajuste', 'too tight': 'demasiado ajustado', 'too loose': 'demasiado holgado',
      'too short': 'demasiado corto', 'too long': 'demasiado largo', 'no data': 'sin datos', 'FIT SCORE': 'PUNTUACIÓN',
      'Zone by zone': 'Zona por zona', 'Every size, scored for you': 'Cada talla, puntuada para ti', 'Your silhouette': 'Tu silueta',
      "You'd like these": 'Te gustarán estos',
      'Used everywhere you see or enter measurements.': 'Se usa en todo lugar donde veas o ingreses medidas.',
      'The interface language for FitCheck on this device.': 'El idioma de la interfaz de FitCheck en este dispositivo.',
      "You're browsing as a guest. An account lets you save measurements, use the camera, add photos and keep history.": 'Estás navegando como invitado. Una cuenta te permite guardar medidas, usar la cámara, añadir fotos y guardar el historial.',
      'Log in / Create free account': 'Iniciar sesión / Crear cuenta gratis',
      'FitCheck works as an app on your phone:': 'FitCheck funciona como una app en tu teléfono:',
      'Desktop': 'Escritorio',
      'Open in Safari → Share button → "Add to Home Screen".': 'Abre en Safari → botón Compartir → "Añadir a pantalla de inicio".',
      'Open in Chrome → menu (⋮) → "Add to Home screen" / "Install app".': 'Abre en Chrome → menú (⋮) → "Añadir a pantalla de inicio" / "Instalar app".',
      'Chrome / Edge → install icon in the address bar.': 'Chrome / Edge → icono de instalación en la barra de direcciones.',
      'Everything — any preferences — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'Todo — cualquier preferencia — se guarda solo en este navegador en este dispositivo. No se envía nada a ningún servidor. Borrar los datos del navegador lo eliminará.',
      'Everything — your account, measurements, photos and history — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'Todo — tu cuenta, medidas, fotos e historial — se guarda solo en este navegador en este dispositivo. No se envía nada a ningún servidor. Borrar los datos del navegador lo eliminará.',
      'Delete my account & data': 'Eliminar mi cuenta y datos',
      'Not sure': 'No estoy seguro'
    },
    zh: {
      'Home': '首页', 'Analyze': '分析', 'Profiles': '档案', 'History': '历史',
      'For you': '为你推荐', 'Help': '帮助', 'Settings': '设置',
      "Who's wearing it": '谁来穿', 'The garment': '服装', 'Verdict': '结果',
      'Continue': '继续', 'Back': '返回', 'Cancel': '取消', 'Delete': '删除', 'Remove': '移除',
      'Log in': '登录', 'Log out': '退出', 'Take my measure': '记录我的尺寸',
      'Get the verdict': '查看结果', 'On to the garment': '下一步：服装', 'Save & continue': '保存并继续',
      'Check another garment': '检查另一件', 'Change password': '修改密码', 'Update password': '更新密码',
      'Account': '账户', 'Units': '单位', 'Language': '语言', 'Privacy & data': '隐私与数据',
      'Centimetres (cm)': '厘米 (cm)', 'Inches (in)': '英寸 (in)', 'Install FitCheck': '安装 FitCheck',
      'Garment type': '服装类型', 'How do you like it to fit?': '你喜欢怎样的版型？',
      'Slim / fitted': '修身', 'Regular': '常规', 'Relaxed / oversized': '宽松',
      'Female or male sizing?': '女装还是男装尺码？', 'Female': '女', 'Male': '男',
      'Profile name': '档案名称', 'Profile': '档案', 'Current password': '当前密码', 'New password': '新密码',
      'Height': '身高', 'Weight': '体重', 'Chest / Bust': '胸围', 'Waist': '腰围', 'Hips': '臀围',
      'Shoulder width': '肩宽', 'Arm length': '臂长', 'Inseam': '内长', 'Thigh': '大腿围',
      'Chest': '胸围', 'Shoulders': '肩部', 'Sleeve length': '袖长', 'Garment length': '衣长',
      'good fit': '合身', 'too tight': '太紧', 'too loose': '太松',
      'too short': '太短', 'too long': '太长', 'no data': '无数据', 'FIT SCORE': '贴合评分',
      'Zone by zone': '逐部位分析', 'Every size, scored for you': '为你评分每个尺码', 'Your silhouette': '你的身形',
      "You'd like these": '你会喜欢这些',
      'Used everywhere you see or enter measurements.': '用于所有显示或输入尺寸的地方。',
      'The interface language for FitCheck on this device.': '本设备上 FitCheck 的界面语言。',
      "You're browsing as a guest. An account lets you save measurements, use the camera, add photos and keep history.": '你正在以访客身份浏览。注册账户可保存尺寸、使用相机、添加照片并保留历史记录。',
      'Log in / Create free account': '登录 / 创建免费账户',
      'FitCheck works as an app on your phone:': 'FitCheck 可作为应用安装到你的手机上：',
      'Desktop': '电脑',
      'Open in Safari → Share button → "Add to Home Screen".': '在 Safari 中打开 → 分享按钮 → “添加到主屏幕”。',
      'Open in Chrome → menu (⋮) → "Add to Home screen" / "Install app".': '在 Chrome 中打开 → 菜单 (⋮) → “添加到主屏幕” / “安装应用”。',
      'Chrome / Edge → install icon in the address bar.': 'Chrome / Edge → 地址栏中的安装图标。',
      'Everything — any preferences — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': '所有内容——任何偏好设置——只存储在本设备的此浏览器中。不会发送到任何服务器。清除浏览器数据将会删除它。',
      'Everything — your account, measurements, photos and history — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': '所有内容——你的账户、尺寸、照片和历史记录——只存储在本设备的此浏览器中。不会发送到任何服务器。清除浏览器数据将会删除它。',
      'Delete my account & data': '删除我的账户和数据',
      'Not sure': '不确定'
    },
    hi: {
      'Home': 'होम', 'Analyze': 'विश्लेषण', 'Profiles': 'प्रोफ़ाइल', 'History': 'इतिहास',
      'For you': 'आपके लिए', 'Help': 'मदद', 'Settings': 'सेटिंग्स',
      "Who's wearing it": 'कौन पहनेगा', 'The garment': 'परिधान', 'Verdict': 'नतीजा',
      'Continue': 'जारी रखें', 'Back': 'वापस', 'Cancel': 'रद्द करें', 'Delete': 'हटाएँ', 'Remove': 'हटाएँ',
      'Log in': 'लॉग इन', 'Log out': 'लॉग आउट', 'Take my measure': 'मेरे माप लें',
      'Get the verdict': 'नतीजा देखें', 'On to the garment': 'परिधान की ओर', 'Save & continue': 'सहेजें और जारी रखें',
      'Check another garment': 'दूसरा परिधान जाँचें', 'Change password': 'पासवर्ड बदलें', 'Update password': 'पासवर्ड अपडेट करें',
      'Account': 'खाता', 'Units': 'इकाइयाँ', 'Language': 'भाषा', 'Privacy & data': 'गोपनीयता और डेटा',
      'Centimetres (cm)': 'सेंटीमीटर (cm)', 'Inches (in)': 'इंच (in)', 'Install FitCheck': 'FitCheck इंस्टॉल करें',
      'Garment type': 'परिधान का प्रकार', 'How do you like it to fit?': 'आपको फिटिंग कैसी पसंद है?',
      'Slim / fitted': 'स्लिम', 'Regular': 'सामान्य', 'Relaxed / oversized': 'ढीला',
      'Female or male sizing?': 'महिला या पुरुष साइज़?', 'Female': 'महिला', 'Male': 'पुरुष',
      'Profile name': 'प्रोफ़ाइल नाम', 'Profile': 'प्रोफ़ाइल', 'Current password': 'वर्तमान पासवर्ड', 'New password': 'नया पासवर्ड',
      'Height': 'ऊँचाई', 'Weight': 'वज़न', 'Chest / Bust': 'छाती', 'Waist': 'कमर', 'Hips': 'कूल्हे',
      'Shoulder width': 'कंधे की चौड़ाई', 'Arm length': 'बाँह की लंबाई', 'Inseam': 'अंदरूनी सिलाई', 'Thigh': 'जांघ',
      'Chest': 'छाती', 'Shoulders': 'कंधे', 'Sleeve length': 'आस्तीन की लंबाई', 'Garment length': 'परिधान की लंबाई',
      'good fit': 'अच्छी फिटिंग', 'too tight': 'बहुत तंग', 'too loose': 'बहुत ढीला',
      'too short': 'बहुत छोटा', 'too long': 'बहुत लंबा', 'no data': 'कोई डेटा नहीं', 'FIT SCORE': 'फिट स्कोर',
      'Zone by zone': 'हिस्सा-दर-हिस्सा', 'Every size, scored for you': 'हर साइज़, आपके लिए आँका गया', 'Your silhouette': 'आपकी काया',
      "You'd like these": 'आपको ये पसंद आएँगे',
      'Used everywhere you see or enter measurements.': 'जहाँ भी आप माप देखते या दर्ज करते हैं, वहाँ उपयोग होता है।',
      'The interface language for FitCheck on this device.': 'इस डिवाइस पर FitCheck की इंटरफ़ेस भाषा।',
      "You're browsing as a guest. An account lets you save measurements, use the camera, add photos and keep history.": 'आप अतिथि के रूप में ब्राउज़ कर रहे हैं। खाता होने पर आप माप सहेज सकते हैं, कैमरा उपयोग कर सकते हैं, फ़ोटो जोड़ सकते हैं और इतिहास रख सकते हैं।',
      'Log in / Create free account': 'लॉग इन / मुफ़्त खाता बनाएँ',
      'FitCheck works as an app on your phone:': 'FitCheck आपके फ़ोन पर ऐप की तरह काम करता है:',
      'Desktop': 'डेस्कटॉप',
      'Open in Safari → Share button → "Add to Home Screen".': 'Safari में खोलें → शेयर बटन → "होम स्क्रीन में जोड़ें"।',
      'Open in Chrome → menu (⋮) → "Add to Home screen" / "Install app".': 'Chrome में खोलें → मेन्यू (⋮) → "होम स्क्रीन में जोड़ें" / "ऐप इंस्टॉल करें"।',
      'Chrome / Edge → install icon in the address bar.': 'Chrome / Edge → एड्रेस बार में इंस्टॉल आइकन।',
      'Everything — any preferences — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'सब कुछ — कोई भी प्राथमिकताएँ — केवल इस डिवाइस के इस ब्राउज़र में संग्रहित होता है। कुछ भी किसी सर्वर पर नहीं भेजा जाता। ब्राउज़र डेटा साफ़ करने पर यह मिट जाएगा।',
      'Everything — your account, measurements, photos and history — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'सब कुछ — आपका खाता, माप, फ़ोटो और इतिहास — केवल इस डिवाइस के इस ब्राउज़र में संग्रहित होता है। कुछ भी किसी सर्वर पर नहीं भेजा जाता। ब्राउज़र डेटा साफ़ करने पर यह मिट जाएगा।',
      'Delete my account & data': 'मेरा खाता और डेटा हटाएँ',
      'Not sure': 'पक्का नहीं'
    },
    ar: {
      'Home': 'الرئيسية', 'Analyze': 'تحليل', 'Profiles': 'الملفات', 'History': 'السجل',
      'For you': 'لك', 'Help': 'مساعدة', 'Settings': 'الإعدادات',
      "Who's wearing it": 'من سيرتديه', 'The garment': 'القطعة', 'Verdict': 'النتيجة',
      'Continue': 'متابعة', 'Back': 'رجوع', 'Cancel': 'إلغاء', 'Delete': 'حذف', 'Remove': 'إزالة',
      'Log in': 'تسجيل الدخول', 'Log out': 'تسجيل الخروج', 'Take my measure': 'خذ مقاساتي',
      'Get the verdict': 'عرض النتيجة', 'On to the garment': 'إلى القطعة', 'Save & continue': 'حفظ ومتابعة',
      'Check another garment': 'تحقق من قطعة أخرى', 'Change password': 'تغيير كلمة المرور', 'Update password': 'تحديث كلمة المرور',
      'Account': 'الحساب', 'Units': 'الوحدات', 'Language': 'اللغة', 'Privacy & data': 'الخصوصية والبيانات',
      'Centimetres (cm)': 'سنتيمتر (cm)', 'Inches (in)': 'بوصة (in)', 'Install FitCheck': 'تثبيت FitCheck',
      'Garment type': 'نوع القطعة', 'How do you like it to fit?': 'كيف تفضّل القَصّة؟',
      'Slim / fitted': 'ضيّق', 'Regular': 'عادي', 'Relaxed / oversized': 'فضفاض',
      'Female or male sizing?': 'مقاسات نسائية أم رجالية؟', 'Female': 'نسائي', 'Male': 'رجالي',
      'Profile name': 'اسم الملف', 'Profile': 'الملف', 'Current password': 'كلمة المرور الحالية', 'New password': 'كلمة مرور جديدة',
      'Height': 'الطول', 'Weight': 'الوزن', 'Chest / Bust': 'الصدر', 'Waist': 'الخصر', 'Hips': 'الورك',
      'Shoulder width': 'عرض الكتف', 'Arm length': 'طول الذراع', 'Inseam': 'طول الساق الداخلي', 'Thigh': 'الفخذ',
      'Chest': 'الصدر', 'Shoulders': 'الكتفان', 'Sleeve length': 'طول الكم', 'Garment length': 'طول القطعة',
      'good fit': 'مقاس مناسب', 'too tight': 'ضيّق جدًا', 'too loose': 'واسع جدًا',
      'too short': 'قصير جدًا', 'too long': 'طويل جدًا', 'no data': 'لا بيانات', 'FIT SCORE': 'درجة الملاءمة',
      'Zone by zone': 'منطقة بمنطقة', 'Every size, scored for you': 'كل مقاس مُقيّم لك', 'Your silhouette': 'قوامك',
      "You'd like these": 'قد يعجبك هذا',
      'Used everywhere you see or enter measurements.': 'تُستخدم في كل مكان ترى فيه المقاسات أو تُدخلها.',
      'The interface language for FitCheck on this device.': 'لغة واجهة FitCheck على هذا الجهاز.',
      "You're browsing as a guest. An account lets you save measurements, use the camera, add photos and keep history.": 'أنت تتصفح كضيف. يتيح لك الحساب حفظ المقاسات واستخدام الكاميرا وإضافة الصور والاحتفاظ بالسجل.',
      'Log in / Create free account': 'تسجيل الدخول / إنشاء حساب مجاني',
      'FitCheck works as an app on your phone:': 'يعمل FitCheck كتطبيق على هاتفك:',
      'Desktop': 'سطح المكتب',
      'Open in Safari → Share button → "Add to Home Screen".': 'افتح في Safari → زر المشاركة → "إضافة إلى الشاشة الرئيسية".',
      'Open in Chrome → menu (⋮) → "Add to Home screen" / "Install app".': 'افتح في Chrome → القائمة (⋮) → "إضافة إلى الشاشة الرئيسية" / "تثبيت التطبيق".',
      'Chrome / Edge → install icon in the address bar.': 'Chrome / Edge → أيقونة التثبيت في شريط العناوين.',
      'Everything — any preferences — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'كل شيء — أي تفضيلات — يُخزَّن فقط في هذا المتصفح على هذا الجهاز. لا يُرسَل أي شيء إلى أي خادم. مسح بيانات المتصفح سيؤدي إلى حذفه.',
      'Everything — your account, measurements, photos and history — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'كل شيء — حسابك ومقاساتك وصورك وسجلك — يُخزَّن فقط في هذا المتصفح على هذا الجهاز. لا يُرسَل أي شيء إلى أي خادم. مسح بيانات المتصفح سيؤدي إلى حذفه.',
      'Delete my account & data': 'حذف حسابي وبياناتي',
      'Not sure': 'غير متأكد'
    },
    pt: {
      'Home': 'Início', 'Analyze': 'Analisar', 'Profiles': 'Perfis', 'History': 'Histórico',
      'For you': 'Para você', 'Help': 'Ajuda', 'Settings': 'Configurações',
      "Who's wearing it": 'Quem vai usar', 'The garment': 'A peça', 'Verdict': 'Veredito',
      'Continue': 'Continuar', 'Back': 'Voltar', 'Cancel': 'Cancelar', 'Delete': 'Excluir', 'Remove': 'Remover',
      'Log in': 'Entrar', 'Log out': 'Sair', 'Take my measure': 'Tirar minhas medidas',
      'Get the verdict': 'Ver o veredito', 'On to the garment': 'Ir para a peça', 'Save & continue': 'Salvar e continuar',
      'Check another garment': 'Analisar outra peça', 'Change password': 'Alterar senha', 'Update password': 'Atualizar senha',
      'Account': 'Conta', 'Units': 'Unidades', 'Language': 'Idioma', 'Privacy & data': 'Privacidade e dados',
      'Centimetres (cm)': 'Centímetros (cm)', 'Inches (in)': 'Polegadas (in)', 'Install FitCheck': 'Instalar FitCheck',
      'Garment type': 'Tipo de peça', 'How do you like it to fit?': 'Como você gosta que fique?',
      'Slim / fitted': 'Justo', 'Regular': 'Regular', 'Relaxed / oversized': 'Folgado',
      'Female or male sizing?': 'Tamanhos feminino ou masculino?', 'Female': 'Feminino', 'Male': 'Masculino',
      'Profile name': 'Nome do perfil', 'Profile': 'Perfil', 'Current password': 'Senha atual', 'New password': 'Nova senha',
      'Height': 'Altura', 'Weight': 'Peso', 'Chest / Bust': 'Peito / Busto', 'Waist': 'Cintura', 'Hips': 'Quadril',
      'Shoulder width': 'Largura dos ombros', 'Arm length': 'Comprimento do braço', 'Inseam': 'Entreperna', 'Thigh': 'Coxa',
      'Chest': 'Peito', 'Shoulders': 'Ombros', 'Sleeve length': 'Comprimento da manga', 'Garment length': 'Comprimento da peça',
      'good fit': 'bom caimento', 'too tight': 'muito justo', 'too loose': 'muito folgado',
      'too short': 'muito curto', 'too long': 'muito longo', 'no data': 'sem dados', 'FIT SCORE': 'PONTUAÇÃO',
      'Zone by zone': 'Zona por zona', 'Every size, scored for you': 'Cada tamanho, avaliado para você', 'Your silhouette': 'Sua silhueta',
      "You'd like these": 'Você vai gostar destes',
      'Used everywhere you see or enter measurements.': 'Usado em todos os lugares onde você vê ou insere medidas.',
      'The interface language for FitCheck on this device.': 'O idioma da interface do FitCheck neste dispositivo.',
      "You're browsing as a guest. An account lets you save measurements, use the camera, add photos and keep history.": 'Você está navegando como convidado. Uma conta permite salvar medidas, usar a câmera, adicionar fotos e manter o histórico.',
      'Log in / Create free account': 'Entrar / Criar conta grátis',
      'FitCheck works as an app on your phone:': 'O FitCheck funciona como um app no seu telefone:',
      'Desktop': 'Computador',
      'Open in Safari → Share button → "Add to Home Screen".': 'Abra no Safari → botão Compartilhar → "Adicionar à Tela de Início".',
      'Open in Chrome → menu (⋮) → "Add to Home screen" / "Install app".': 'Abra no Chrome → menu (⋮) → "Adicionar à tela de início" / "Instalar app".',
      'Chrome / Edge → install icon in the address bar.': 'Chrome / Edge → ícone de instalação na barra de endereços.',
      'Everything — any preferences — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'Tudo — qualquer preferência — é armazenado apenas neste navegador neste dispositivo. Nada é enviado a nenhum servidor. Limpar os dados do navegador irá apagá-lo.',
      'Everything — your account, measurements, photos and history — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'Tudo — sua conta, medidas, fotos e histórico — é armazenado apenas neste navegador neste dispositivo. Nada é enviado a nenhum servidor. Limpar os dados do navegador irá apagá-lo.',
      'Delete my account & data': 'Excluir minha conta e dados',
      'Not sure': 'Não sei'
    },
    fr: {
      'Home': 'Accueil', 'Analyze': 'Analyser', 'Profiles': 'Profils', 'History': 'Historique',
      'For you': 'Pour vous', 'Help': 'Aide', 'Settings': 'Paramètres',
      "Who's wearing it": 'Qui le porte', 'The garment': 'Le vêtement', 'Verdict': 'Verdict',
      'Continue': 'Continuer', 'Back': 'Retour', 'Cancel': 'Annuler', 'Delete': 'Supprimer', 'Remove': 'Retirer',
      'Log in': 'Se connecter', 'Log out': 'Se déconnecter', 'Take my measure': 'Prendre mes mesures',
      'Get the verdict': 'Voir le verdict', 'On to the garment': 'Passer au vêtement', 'Save & continue': 'Enregistrer et continuer',
      'Check another garment': 'Analyser un autre vêtement', 'Change password': 'Changer le mot de passe', 'Update password': 'Mettre à jour',
      'Account': 'Compte', 'Units': 'Unités', 'Language': 'Langue', 'Privacy & data': 'Confidentialité et données',
      'Centimetres (cm)': 'Centimètres (cm)', 'Inches (in)': 'Pouces (in)', 'Install FitCheck': 'Installer FitCheck',
      'Garment type': 'Type de vêtement', 'How do you like it to fit?': 'Quelle coupe préférez-vous ?',
      'Slim / fitted': 'Ajusté', 'Regular': 'Standard', 'Relaxed / oversized': 'Ample',
      'Female or male sizing?': 'Tailles femme ou homme ?', 'Female': 'Femme', 'Male': 'Homme',
      'Profile name': 'Nom du profil', 'Profile': 'Profil', 'Current password': 'Mot de passe actuel', 'New password': 'Nouveau mot de passe',
      'Height': 'Taille', 'Weight': 'Poids', 'Chest / Bust': 'Poitrine', 'Waist': 'Tour de taille', 'Hips': 'Hanches',
      'Shoulder width': 'Largeur d’épaules', 'Arm length': 'Longueur de bras', 'Inseam': 'Entrejambe', 'Thigh': 'Cuisse',
      'Chest': 'Poitrine', 'Shoulders': 'Épaules', 'Sleeve length': 'Longueur de manche', 'Garment length': 'Longueur du vêtement',
      'good fit': 'bonne coupe', 'too tight': 'trop serré', 'too loose': 'trop ample',
      'too short': 'trop court', 'too long': 'trop long', 'no data': 'aucune donnée', 'FIT SCORE': 'SCORE',
      'Zone by zone': 'Zone par zone', 'Every size, scored for you': 'Chaque taille, notée pour vous', 'Your silhouette': 'Votre silhouette',
      "You'd like these": 'Vous aimerez ceux-ci',
      'Used everywhere you see or enter measurements.': 'Utilisé partout où vous voyez ou saisissez des mesures.',
      'The interface language for FitCheck on this device.': 'La langue de l’interface de FitCheck sur cet appareil.',
      "You're browsing as a guest. An account lets you save measurements, use the camera, add photos and keep history.": 'Vous naviguez en tant qu’invité. Un compte vous permet d’enregistrer vos mesures, d’utiliser l’appareil photo, d’ajouter des photos et de conserver l’historique.',
      'Log in / Create free account': 'Se connecter / Créer un compte gratuit',
      'FitCheck works as an app on your phone:': 'FitCheck fonctionne comme une application sur votre téléphone :',
      'Desktop': 'Ordinateur',
      'Open in Safari → Share button → "Add to Home Screen".': 'Ouvrez dans Safari → bouton Partager → « Ajouter à l’écran d’accueil ».',
      'Open in Chrome → menu (⋮) → "Add to Home screen" / "Install app".': 'Ouvrez dans Chrome → menu (⋮) → « Ajouter à l’écran d’accueil » / « Installer l’application ».',
      'Chrome / Edge → install icon in the address bar.': 'Chrome / Edge → icône d’installation dans la barre d’adresse.',
      'Everything — any preferences — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'Tout — les préférences éventuelles — est stocké uniquement dans ce navigateur sur cet appareil. Rien n’est envoyé à un serveur. Effacer les données du navigateur l’effacera.',
      'Everything — your account, measurements, photos and history — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'Tout — votre compte, vos mesures, vos photos et votre historique — est stocké uniquement dans ce navigateur sur cet appareil. Rien n’est envoyé à un serveur. Effacer les données du navigateur l’effacera.',
      'Delete my account & data': 'Supprimer mon compte et mes données',
      'Not sure': 'Je ne sais pas'
    },
    de: {
      'Home': 'Start', 'Analyze': 'Analysieren', 'Profiles': 'Profile', 'History': 'Verlauf',
      'For you': 'Für dich', 'Help': 'Hilfe', 'Settings': 'Einstellungen',
      "Who's wearing it": 'Wer trägt es', 'The garment': 'Das Kleidungsstück', 'Verdict': 'Ergebnis',
      'Continue': 'Weiter', 'Back': 'Zurück', 'Cancel': 'Abbrechen', 'Delete': 'Löschen', 'Remove': 'Entfernen',
      'Log in': 'Anmelden', 'Log out': 'Abmelden', 'Take my measure': 'Maße nehmen',
      'Get the verdict': 'Ergebnis anzeigen', 'On to the garment': 'Weiter zum Kleidungsstück', 'Save & continue': 'Speichern und weiter',
      'Check another garment': 'Weiteres Teil prüfen', 'Change password': 'Passwort ändern', 'Update password': 'Passwort aktualisieren',
      'Account': 'Konto', 'Units': 'Einheiten', 'Language': 'Sprache', 'Privacy & data': 'Datenschutz & Daten',
      'Centimetres (cm)': 'Zentimeter (cm)', 'Inches (in)': 'Zoll (in)', 'Install FitCheck': 'FitCheck installieren',
      'Garment type': 'Art des Kleidungsstücks', 'How do you like it to fit?': 'Wie soll es sitzen?',
      'Slim / fitted': 'Eng', 'Regular': 'Normal', 'Relaxed / oversized': 'Locker',
      'Female or male sizing?': 'Damen- oder Herrengrößen?', 'Female': 'Damen', 'Male': 'Herren',
      'Profile name': 'Profilname', 'Profile': 'Profil', 'Current password': 'Aktuelles Passwort', 'New password': 'Neues Passwort',
      'Height': 'Größe', 'Weight': 'Gewicht', 'Chest / Bust': 'Brust', 'Waist': 'Taille', 'Hips': 'Hüfte',
      'Shoulder width': 'Schulterbreite', 'Arm length': 'Armlänge', 'Inseam': 'Schrittlänge', 'Thigh': 'Oberschenkel',
      'Chest': 'Brust', 'Shoulders': 'Schultern', 'Sleeve length': 'Ärmellänge', 'Garment length': 'Länge',
      'good fit': 'gute Passform', 'too tight': 'zu eng', 'too loose': 'zu weit',
      'too short': 'zu kurz', 'too long': 'zu lang', 'no data': 'keine Daten', 'FIT SCORE': 'PASSFORM',
      'Zone by zone': 'Zone für Zone', 'Every size, scored for you': 'Jede Größe für dich bewertet', 'Your silhouette': 'Deine Silhouette',
      "You'd like these": 'Das könnte dir gefallen',
      'Used everywhere you see or enter measurements.': 'Wird überall verwendet, wo du Maße siehst oder eingibst.',
      'The interface language for FitCheck on this device.': 'Die Anzeigesprache von FitCheck auf diesem Gerät.',
      "You're browsing as a guest. An account lets you save measurements, use the camera, add photos and keep history.": 'Du bist als Gast unterwegs. Mit einem Konto kannst du Maße speichern, die Kamera nutzen, Fotos hinzufügen und den Verlauf behalten.',
      'Log in / Create free account': 'Anmelden / Kostenloses Konto erstellen',
      'FitCheck works as an app on your phone:': 'FitCheck funktioniert als App auf deinem Handy:',
      'Desktop': 'Desktop',
      'Open in Safari → Share button → "Add to Home Screen".': 'In Safari öffnen → Teilen-Button → „Zum Home-Bildschirm“.',
      'Open in Chrome → menu (⋮) → "Add to Home screen" / "Install app".': 'In Chrome öffnen → Menü (⋮) → „Zum Startbildschirm“ / „App installieren“.',
      'Chrome / Edge → install icon in the address bar.': 'Chrome / Edge → Installationssymbol in der Adressleiste.',
      'Everything — any preferences — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'Alles — etwaige Einstellungen — wird nur in diesem Browser auf diesem Gerät gespeichert. Nichts wird an einen Server gesendet. Das Löschen der Browserdaten entfernt es.',
      'Everything — your account, measurements, photos and history — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'Alles — dein Konto, deine Maße, Fotos und der Verlauf — wird nur in diesem Browser auf diesem Gerät gespeichert. Nichts wird an einen Server gesendet. Das Löschen der Browserdaten entfernt es.',
      'Delete my account & data': 'Konto & Daten löschen',
      'Not sure': 'Unsicher'
    },
    ru: {
      'Home': 'Главная', 'Analyze': 'Анализ', 'Profiles': 'Профили', 'History': 'История',
      'For you': 'Для вас', 'Help': 'Помощь', 'Settings': 'Настройки',
      "Who's wearing it": 'Кто наденет', 'The garment': 'Одежда', 'Verdict': 'Результат',
      'Continue': 'Продолжить', 'Back': 'Назад', 'Cancel': 'Отмена', 'Delete': 'Удалить', 'Remove': 'Убрать',
      'Log in': 'Войти', 'Log out': 'Выйти', 'Take my measure': 'Снять мерки',
      'Get the verdict': 'Показать результат', 'On to the garment': 'К одежде', 'Save & continue': 'Сохранить и продолжить',
      'Check another garment': 'Проверить другую вещь', 'Change password': 'Сменить пароль', 'Update password': 'Обновить пароль',
      'Account': 'Аккаунт', 'Units': 'Единицы', 'Language': 'Язык', 'Privacy & data': 'Конфиденциальность и данные',
      'Centimetres (cm)': 'Сантиметры (см)', 'Inches (in)': 'Дюймы (in)', 'Install FitCheck': 'Установить FitCheck',
      'Garment type': 'Тип одежды', 'How do you like it to fit?': 'Какая посадка вам нравится?',
      'Slim / fitted': 'Приталенный', 'Regular': 'Обычный', 'Relaxed / oversized': 'Свободный',
      'Female or male sizing?': 'Женские или мужские размеры?', 'Female': 'Женский', 'Male': 'Мужской',
      'Profile name': 'Имя профиля', 'Profile': 'Профиль', 'Current password': 'Текущий пароль', 'New password': 'Новый пароль',
      'Height': 'Рост', 'Weight': 'Вес', 'Chest / Bust': 'Грудь', 'Waist': 'Талия', 'Hips': 'Бёдра',
      'Shoulder width': 'Ширина плеч', 'Arm length': 'Длина руки', 'Inseam': 'Внутренний шов', 'Thigh': 'Бедро',
      'Chest': 'Грудь', 'Shoulders': 'Плечи', 'Sleeve length': 'Длина рукава', 'Garment length': 'Длина изделия',
      'good fit': 'хорошо сидит', 'too tight': 'слишком узко', 'too loose': 'слишком свободно',
      'too short': 'слишком коротко', 'too long': 'слишком длинно', 'no data': 'нет данных', 'FIT SCORE': 'ОЦЕНКА',
      'Zone by zone': 'Зона за зоной', 'Every size, scored for you': 'Каждый размер оценён для вас', 'Your silhouette': 'Ваш силуэт',
      "You'd like these": 'Вам понравится это',
      'Used everywhere you see or enter measurements.': 'Используется везде, где вы видите или вводите мерки.',
      'The interface language for FitCheck on this device.': 'Язык интерфейса FitCheck на этом устройстве.',
      "You're browsing as a guest. An account lets you save measurements, use the camera, add photos and keep history.": 'Вы просматриваете как гость. Аккаунт позволяет сохранять мерки, использовать камеру, добавлять фото и хранить историю.',
      'Log in / Create free account': 'Войти / Создать бесплатный аккаунт',
      'FitCheck works as an app on your phone:': 'FitCheck работает как приложение на вашем телефоне:',
      'Desktop': 'Компьютер',
      'Open in Safari → Share button → "Add to Home Screen".': 'Откройте в Safari → кнопка «Поделиться» → «На экран „Домой“».',
      'Open in Chrome → menu (⋮) → "Add to Home screen" / "Install app".': 'Откройте в Chrome → меню (⋮) → «Добавить на главный экран» / «Установить приложение».',
      'Chrome / Edge → install icon in the address bar.': 'Chrome / Edge → значок установки в адресной строке.',
      'Everything — any preferences — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'Всё — любые настройки — хранится только в этом браузере на этом устройстве. Ничего не отправляется на сервер. Очистка данных браузера удалит это.',
      'Everything — your account, measurements, photos and history — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'Всё — ваш аккаунт, мерки, фото и история — хранится только в этом браузере на этом устройстве. Ничего не отправляется на сервер. Очистка данных браузера удалит это.',
      'Delete my account & data': 'Удалить аккаунт и данные',
      'Not sure': 'Не уверен'
    },
    ja: {
      'Home': 'ホーム', 'Analyze': '分析', 'Profiles': 'プロフィール', 'History': '履歴',
      'For you': 'おすすめ', 'Help': 'ヘルプ', 'Settings': '設定',
      "Who's wearing it": '着る人', 'The garment': '衣類', 'Verdict': '結果',
      'Continue': '続ける', 'Back': '戻る', 'Cancel': 'キャンセル', 'Delete': '削除', 'Remove': '削除',
      'Log in': 'ログイン', 'Log out': 'ログアウト', 'Take my measure': '採寸する',
      'Get the verdict': '結果を見る', 'On to the garment': '衣類へ進む', 'Save & continue': '保存して続ける',
      'Check another garment': '別の衣類を確認', 'Change password': 'パスワード変更', 'Update password': 'パスワードを更新',
      'Account': 'アカウント', 'Units': '単位', 'Language': '言語', 'Privacy & data': 'プライバシーとデータ',
      'Centimetres (cm)': 'センチ (cm)', 'Inches (in)': 'インチ (in)', 'Install FitCheck': 'FitCheck をインストール',
      'Garment type': '衣類の種類', 'How do you like it to fit?': 'どんな着心地が好みですか？',
      'Slim / fitted': 'スリム', 'Regular': 'レギュラー', 'Relaxed / oversized': 'ゆったり',
      'Female or male sizing?': 'レディースかメンズか？', 'Female': 'レディース', 'Male': 'メンズ',
      'Profile name': 'プロフィール名', 'Profile': 'プロフィール', 'Current password': '現在のパスワード', 'New password': '新しいパスワード',
      'Height': '身長', 'Weight': '体重', 'Chest / Bust': '胸囲', 'Waist': 'ウエスト', 'Hips': 'ヒップ',
      'Shoulder width': '肩幅', 'Arm length': '腕の長さ', 'Inseam': '股下', 'Thigh': '太もも',
      'Chest': '胸囲', 'Shoulders': '肩', 'Sleeve length': '袖丈', 'Garment length': '着丈',
      'good fit': 'ぴったり', 'too tight': 'きつすぎ', 'too loose': 'ゆるすぎ',
      'too short': '短すぎ', 'too long': '長すぎ', 'no data': 'データなし', 'FIT SCORE': 'フィットスコア',
      'Zone by zone': '部位ごと', 'Every size, scored for you': '各サイズをあなたに合わせて採点', 'Your silhouette': 'あなたのシルエット',
      "You'd like these": 'これがおすすめ',
      'Used everywhere you see or enter measurements.': '採寸を表示・入力するすべての場所で使われます。',
      'The interface language for FitCheck on this device.': 'この端末での FitCheck の表示言語。',
      "You're browsing as a guest. An account lets you save measurements, use the camera, add photos and keep history.": 'ゲストとして閲覧中です。アカウントを作成すると、採寸の保存、カメラの利用、写真の追加、履歴の保存ができます。',
      'Log in / Create free account': 'ログイン / 無料アカウント作成',
      'FitCheck works as an app on your phone:': 'FitCheck はスマホのアプリとして使えます：',
      'Desktop': 'パソコン',
      'Open in Safari → Share button → "Add to Home Screen".': 'Safari で開く → 共有ボタン → 「ホーム画面に追加」。',
      'Open in Chrome → menu (⋮) → "Add to Home screen" / "Install app".': 'Chrome で開く → メニュー (⋮) → 「ホーム画面に追加」/「アプリをインストール」。',
      'Chrome / Edge → install icon in the address bar.': 'Chrome / Edge → アドレスバーのインストールアイコン。',
      'Everything — any preferences — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'すべて — 各種設定 — はこの端末のこのブラウザにのみ保存されます。どのサーバーにも送信されません。ブラウザのデータを消去すると削除されます。',
      'Everything — your account, measurements, photos and history — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'すべて — アカウント、採寸、写真、履歴 — はこの端末のこのブラウザにのみ保存されます。どのサーバーにも送信されません。ブラウザのデータを消去すると削除されます。',
      'Delete my account & data': 'アカウントとデータを削除',
      'Not sure': 'わからない'
    },
    it: {
      'Home': 'Home', 'Analyze': 'Analizza', 'Profiles': 'Profili', 'History': 'Cronologia',
      'For you': 'Per te', 'Help': 'Aiuto', 'Settings': 'Impostazioni',
      "Who's wearing it": 'Chi lo indossa', 'The garment': 'Il capo', 'Verdict': 'Verdetto',
      'Continue': 'Continua', 'Back': 'Indietro', 'Cancel': 'Annulla', 'Delete': 'Elimina', 'Remove': 'Rimuovi',
      'Log in': 'Accedi', 'Log out': 'Esci', 'Take my measure': 'Prendi le misure',
      'Get the verdict': 'Vedi il verdetto', 'On to the garment': 'Passa al capo', 'Save & continue': 'Salva e continua',
      'Check another garment': 'Analizza un altro capo', 'Change password': 'Cambia password', 'Update password': 'Aggiorna password',
      'Account': 'Account', 'Units': 'Unità', 'Language': 'Lingua', 'Privacy & data': 'Privacy e dati',
      'Centimetres (cm)': 'Centimetri (cm)', 'Inches (in)': 'Pollici (in)', 'Install FitCheck': 'Installa FitCheck',
      'Garment type': 'Tipo di capo', 'How do you like it to fit?': 'Come preferisci la vestibilità?',
      'Slim / fitted': 'Aderente', 'Regular': 'Regolare', 'Relaxed / oversized': 'Ampio',
      'Female or male sizing?': 'Taglie donna o uomo?', 'Female': 'Donna', 'Male': 'Uomo',
      'Profile name': 'Nome del profilo', 'Profile': 'Profilo', 'Current password': 'Password attuale', 'New password': 'Nuova password',
      'Height': 'Altezza', 'Weight': 'Peso', 'Chest / Bust': 'Petto / Seno', 'Waist': 'Vita', 'Hips': 'Fianchi',
      'Shoulder width': 'Larghezza spalle', 'Arm length': 'Lunghezza braccio', 'Inseam': 'Cavallo', 'Thigh': 'Coscia',
      'Chest': 'Petto', 'Shoulders': 'Spalle', 'Sleeve length': 'Lunghezza manica', 'Garment length': 'Lunghezza capo',
      'good fit': 'buona vestibilità', 'too tight': 'troppo stretto', 'too loose': 'troppo largo',
      'too short': 'troppo corto', 'too long': 'troppo lungo', 'no data': 'nessun dato', 'FIT SCORE': 'PUNTEGGIO',
      'Zone by zone': 'Zona per zona', 'Every size, scored for you': 'Ogni taglia, valutata per te', 'Your silhouette': 'La tua silhouette',
      "You'd like these": 'Ti piaceranno questi',
      'Used everywhere you see or enter measurements.': 'Usato ovunque vedi o inserisci misure.',
      'The interface language for FitCheck on this device.': 'La lingua dell’interfaccia di FitCheck su questo dispositivo.',
      "You're browsing as a guest. An account lets you save measurements, use the camera, add photos and keep history.": 'Stai navigando come ospite. Un account ti permette di salvare le misure, usare la fotocamera, aggiungere foto e conservare la cronologia.',
      'Log in / Create free account': 'Accedi / Crea un account gratuito',
      'FitCheck works as an app on your phone:': 'FitCheck funziona come un’app sul tuo telefono:',
      'Desktop': 'Computer',
      'Open in Safari → Share button → "Add to Home Screen".': 'Apri in Safari → pulsante Condividi → "Aggiungi a Home".',
      'Open in Chrome → menu (⋮) → "Add to Home screen" / "Install app".': 'Apri in Chrome → menu (⋮) → "Aggiungi a schermata Home" / "Installa app".',
      'Chrome / Edge → install icon in the address bar.': 'Chrome / Edge → icona di installazione nella barra degli indirizzi.',
      'Everything — any preferences — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'Tutto — eventuali preferenze — è memorizzato solo in questo browser su questo dispositivo. Nulla viene inviato a nessun server. Cancellare i dati del browser lo eliminerà.',
      'Everything — your account, measurements, photos and history — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'Tutto — il tuo account, le misure, le foto e la cronologia — è memorizzato solo in questo browser su questo dispositivo. Nulla viene inviato a nessun server. Cancellare i dati del browser lo eliminerà.',
      'Delete my account & data': 'Elimina account e dati',
      'Not sure': 'Non so'
    },
    sv: {
      'Home': 'Hem', 'Analyze': 'Analysera', 'Profiles': 'Profiler', 'History': 'Historik',
      'For you': 'För dig', 'Help': 'Hjälp', 'Settings': 'Inställningar',
      "Who's wearing it": 'Vem ska bära det', 'The garment': 'Plagget', 'Verdict': 'Utlåtande',
      'Continue': 'Fortsätt', 'Back': 'Tillbaka', 'Cancel': 'Avbryt', 'Delete': 'Ta bort', 'Remove': 'Ta bort',
      'Log in': 'Logga in', 'Log out': 'Logga ut', 'Take my measure': 'Ta mina mått',
      'Get the verdict': 'Se utlåtandet', 'On to the garment': 'Vidare till plagget', 'Save & continue': 'Spara och fortsätt',
      'Check another garment': 'Kolla ett annat plagg', 'Change password': 'Byt lösenord', 'Update password': 'Uppdatera lösenord',
      'Account': 'Konto', 'Units': 'Enheter', 'Language': 'Språk', 'Privacy & data': 'Integritet och data',
      'Centimetres (cm)': 'Centimeter (cm)', 'Inches (in)': 'Tum (in)', 'Install FitCheck': 'Installera FitCheck',
      'Garment type': 'Typ av plagg', 'How do you like it to fit?': 'Hur vill du att det ska sitta?',
      'Slim / fitted': 'Smal', 'Regular': 'Normal', 'Relaxed / oversized': 'Ledig',
      'Female or male sizing?': 'Dam- eller herrstorlekar?', 'Female': 'Dam', 'Male': 'Herr',
      'Profile name': 'Profilnamn', 'Profile': 'Profil', 'Current password': 'Nuvarande lösenord', 'New password': 'Nytt lösenord',
      'Height': 'Längd', 'Weight': 'Vikt', 'Chest / Bust': 'Bröst / Byst', 'Waist': 'Midja', 'Hips': 'Höft',
      'Shoulder width': 'Axelbredd', 'Arm length': 'Armlängd', 'Inseam': 'Innerben', 'Thigh': 'Lår',
      'Chest': 'Bröst', 'Shoulders': 'Axlar', 'Sleeve length': 'Ärmlängd', 'Garment length': 'Plagglängd',
      'good fit': 'bra passform', 'too tight': 'för trångt', 'too loose': 'för löst',
      'too short': 'för kort', 'too long': 'för långt', 'no data': 'inga data', 'FIT SCORE': 'PASSFORM',
      'Zone by zone': 'Zon för zon', 'Every size, scored for you': 'Varje storlek, betygsatt för dig', 'Your silhouette': 'Din silhuett',
      "You'd like these": 'Du gillar nog dessa',
      'Used everywhere you see or enter measurements.': 'Används överallt där du ser eller anger mått.',
      'The interface language for FitCheck on this device.': 'Gränssnittsspråket för FitCheck på den här enheten.',
      "You're browsing as a guest. An account lets you save measurements, use the camera, add photos and keep history.": 'Du surfar som gäst. Med ett konto kan du spara mått, använda kameran, lägga till foton och spara historik.',
      'Log in / Create free account': 'Logga in / Skapa gratis konto',
      'FitCheck works as an app on your phone:': 'FitCheck fungerar som en app på din telefon:',
      'Desktop': 'Dator',
      'Open in Safari → Share button → "Add to Home Screen".': 'Öppna i Safari → Dela-knappen → "Lägg till på hemskärmen".',
      'Open in Chrome → menu (⋮) → "Add to Home screen" / "Install app".': 'Öppna i Chrome → meny (⋮) → "Lägg till på startskärmen" / "Installera app".',
      'Chrome / Edge → install icon in the address bar.': 'Chrome / Edge → installationsikonen i adressfältet.',
      'Everything — any preferences — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'Allt — eventuella inställningar — lagras endast i den här webbläsaren på den här enheten. Inget skickas till någon server. Att rensa webbläsardata raderar det.',
      'Everything — your account, measurements, photos and history — is stored only in this browser on this device. Nothing is sent to any server. Clearing browser data will erase it.': 'Allt — ditt konto, dina mått, foton och historik — lagras endast i den här webbläsaren på den här enheten. Inget skickas till någon server. Att rensa webbläsardata raderar det.',
      'Delete my account & data': 'Radera konto och data',
      'Not sure': 'Osäker'
    }
  };

  let lang = 'en';
  let observer = null;
  let pending = false;

  const origText = new WeakMap();  // text node → its English value
  const origAttr = new WeakMap();  // element → { attr: English value }
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const SKIP_TAGS = /^(SCRIPT|STYLE|TEXTAREA)$/;

  // machine-translation state (for non-curated languages)
  const mtMem = {};            // lang → { english: translated }
  const requested = {};        // lang → Set of strings already sent
  const protectedSet = new Set(['FitCheck', 'Translating…']);
  let fetching = false;
  let refetchQueued = false;
  let serverDown = false;   // local /api/translate missing → use direct fallback
  let origTitle = null;     // English document.title

  function known(code) { for (let i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return true; return false; }

  function load() {
    try { const s = localStorage.getItem(KEY); if (s && known(s)) lang = s; } catch (e) {}
  }

  function mtLoad(l) {
    if (mtMem[l]) return mtMem[l];
    let obj = {};
    try { obj = JSON.parse(localStorage.getItem('fc_mt_' + l) || '{}') || {}; } catch (e) {}
    mtMem[l] = obj;
    requested[l] = requested[l] || new Set(Object.keys(obj));
    return obj;
  }
  function mtSave(l) {
    try { localStorage.setItem('fc_mt_' + l, JSON.stringify(mtMem[l])); } catch (e) {}
  }

  // resolve one English key to its translation: the hand dictionary wins
  // (quality), the machine-translation cache covers everything else
  function resolve(key) {
    if (lang === 'en') return null;
    const d = DICT[lang];
    if (d && d[key] != null) return d[key];
    const m = mtLoad(lang);
    if (m[key] != null) return m[key];
    return null;
  }

  // is this string UI copy we should machine-translate? (never send user data)
  function translatable(s) {
    if (s.length < 2 || s.length > 800) return false;
    if (s.indexOf('@') >= 0) return false;    // emails
    if (!/[A-Za-z]{2}/.test(s)) return false; // needs real words (source is English)
    if (/^[\d\s.,:%×+\-–—·/()]*(cm|in|kg)?[\d\s.,:%×+\-–—·/()]*$/i.test(s)) return false; // pure measurements
    if (/^(xxs|xs|s|m|l|xl|xxl|\dxl)$/i.test(s)) return false; // size labels
    if (protectedSet.has(s)) return false;
    return true;
  }

  function translateTree(root) {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    while (tw.nextNode()) nodes.push(tw.currentNode);
    for (const n of nodes) {
      if (n.parentNode && SKIP_TAGS.test(n.parentNode.nodeName)) continue;
      const base = origText.has(n) ? origText.get(n) : n.nodeValue;
      const key = base.trim();
      if (!key) continue;
      const tr = resolve(key);
      if (tr != null) {
        if (!origText.has(n)) origText.set(n, n.nodeValue);
        n.nodeValue = base.replace(key, tr);
      } else if (origText.has(n)) {
        n.nodeValue = origText.get(n);
        origText.delete(n);
      }
    }

    const els = root.querySelectorAll('[placeholder],[title],[aria-label]');
    for (const el of els) {
      let store = origAttr.get(el);
      for (const a of ATTRS) {
        if (!el.hasAttribute(a)) continue;
        const saved = store && (a in store);
        const base = saved ? store[a] : el.getAttribute(a);
        const key = base.trim();
        if (!key) continue;
        const tr = resolve(key);
        if (tr != null) {
          if (!store) { store = {}; origAttr.set(el, store); }
          if (!(a in store)) store[a] = el.getAttribute(a);
          el.setAttribute(a, base.replace(key, tr));
        } else if (saved) {
          el.setAttribute(a, store[a]);
          delete store[a];
        }
      }
    }
  }

  // find visible strings this language hasn't translated yet
  function collectMissing(root) {
    const m = mtLoad(lang), req = requested[lang], d = DICT[lang];
    const out = [], seen = {};
    const push = raw => {
      const key = raw.trim();
      if (!key || (d && d[key] != null) || m[key] != null || req.has(key) || seen[key] || !translatable(key)) return;
      seen[key] = 1; out.push(key);
    };
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    while (tw.nextNode()) {
      const n = tw.currentNode;
      if (n.parentNode && SKIP_TAGS.test(n.parentNode.nodeName)) continue;
      push(origText.has(n) ? origText.get(n) : n.nodeValue);
    }
    const els = root.querySelectorAll('[placeholder],[title],[aria-label]');
    for (const el of els) {
      const store = origAttr.get(el);
      for (const a of ATTRS) {
        if (!el.hasAttribute(a)) continue;
        push(store && (a in store) ? store[a] : el.getAttribute(a));
      }
    }
    push(origTitle != null ? origTitle : document.title); // browser tab
    return out;
  }

  function showBusy(on) {
    let el = document.getElementById('fc-translating');
    if (on && !el) {
      el = document.createElement('div');
      el.id = 'fc-translating';
      el.textContent = 'Translating…';
      el.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:3000;' +
        'background:#1d1915;color:#f5f1e9;font:600 13px/1 Outfit,system-ui,sans-serif;padding:9px 16px;' +
        'border-radius:999px;box-shadow:0 12px 34px rgba(0,0,0,.35);opacity:.96;pointer-events:none;';
      document.body.appendChild(el);
    } else if (!on && el) {
      el.remove();
    }
  }

  // fetch translations for anything visible-but-missing, then re-apply.
  // Runs for every non-English language: the hand dictionaries answer
  // instantly, the machine fills in all remaining text. Primary path is
  // the local server; if that endpoint is missing (old server process),
  // fall back to calling the public endpoint straight from the browser.
  function pump() {
    if (lang === 'en') return;
    if (fetching) { refetchQueued = true; return; }
    const missing = collectMissing(document.body);
    if (!missing.length) return;
    const l = lang, req = requested[l];
    missing.forEach(s => req.add(s));
    fetching = true; showBusy(true);

    const finish = () => {
      fetching = false; showBusy(false);
      if (refetchQueued) { refetchQueued = false; pump(); }
    };
    const applyBatch = tr => {
      const m = mtLoad(l); let n = 0;
      for (const k in tr) { if (tr[k]) { m[k] = tr[k]; n++; } }
      if (n) { mtSave(l); if (l === lang) apply(); }
      return n;
    };

    if (serverDown) {
      gtxDirect(missing, l, applyBatch)
        .catch(() => { missing.forEach(s => req.delete(s)); })
        .then(finish);
      return;
    }

    // Small chunks, applied as each one lands — the page fills in
    // progressively instead of waiting for one big batch. The DOM is
    // walked top-down, so the first chunk is the text highest on screen.
    const CHUNK = 12, PARALLEL = 4;
    const chunks = [];
    for (let i = 0; i < missing.length; i += CHUNK) chunks.push(missing.slice(i, i + CHUNK));
    let failed = [];
    let idx = 0;

    const worker = () => {
      const c = chunks[idx++];
      if (!c) return Promise.resolve();
      return fetch('api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: l, q: c })
      })
        .then(r => { if (!r.ok) throw new Error('http'); return r.json(); })
        .then(d => {
          if (!d || !d.ok) throw new Error('api');
          applyBatch(d.translations || {});
        })
        .catch(() => { failed = failed.concat(c); })
        .then(worker);
    };

    Promise.all(Array.from({ length: Math.min(PARALLEL, chunks.length) }, worker))
      .then(() => {
        if (failed.length === missing.length) {
          // the local endpoint never answered → direct browser fallback
          serverDown = true;
          return gtxDirect(failed, l, applyBatch)
            .catch(() => { failed.forEach(s => req.delete(s)); });
        }
        if (failed.length) failed.forEach(s => req.delete(s));
      })
      .then(finish);
  }

  // browser-side fallback: translate one string at a time, gently
  function gtxDirect(list, l, applyBatch) {
    const out = {};
    let chain = Promise.resolve();
    const batch = list.slice(0, 60);
    batch.forEach(s => {
      chain = chain.then(() =>
        fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=' +
              encodeURIComponent(l) + '&dt=t&q=' + encodeURIComponent(s))
          .then(r => r.json())
          .then(d => {
            const t = ((d && d[0]) || []).map(x => (x && x[0]) || '').join('');
            if (t) out[s] = t;
          })
          .catch(() => {})
      );
    });
    return chain.then(() => {
      if (!applyBatch(out)) throw new Error('none');
      if (list.length > batch.length) refetchQueued = true; // keep going next round
    });
  }

  function apply() {
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL[lang] ? 'rtl' : 'ltr';
    if (observer) observer.disconnect();
    translateTree(document.body);
    if (observer) observer.observe(document.body, { childList: true, subtree: true });

    // browser-tab title
    const tBase = (origTitle != null ? origTitle : document.title).trim();
    const tTr = resolve(tBase);
    if (tTr != null) {
      if (origTitle == null) origTitle = document.title;
      document.title = tTr;
    } else if (origTitle != null) {
      document.title = origTitle;
      origTitle = null;
    }

    if (lang !== 'en') pump();
  }

  function start() {
    load();
    observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; apply(); });
    });
    if (document.body) apply();
    else document.addEventListener('DOMContentLoaded', apply);
  }

  function set(code) {
    lang = known(code) ? code : 'en';
    try { localStorage.setItem(KEY, lang); } catch (e) {}
    apply();
  }

  // register user-specific text (names, emails) so it's never sent to translate
  function protect(list) {
    (list || []).forEach(s => { if (s && typeof s === 'string') protectedSet.add(s.trim()); });
  }

  function current() { return lang; }

  start();

  return { LANGS, set, current, apply, protect };
})();
