# MQSIO v2.0

تطبيق PWA محلي لتوثيق المواقع باستخدام React + TypeScript + Vite. لا يحتاج Backend أو تسجيل دخول.

## التشغيل

```sh
npm ci
npm run dev
```

للبناء والتحقق:

```sh
npm run build
npm test
npm run test:e2e
npm run preview
```

اختبارات المتصفح تستخدم Chromium في `/usr/bin/chromium`. عند استخدام جهاز آخر، اضبط `executablePath` في `playwright.config.ts` أو احذفه وثبّت Chromium عبر `npx playwright install chromium`. نفّذ البناء قبل اختبار المتصفح، لأنه يفحص نسخة الإنتاج، بما فيها Service Worker.

## الاستخدام على iPhone

1. انشر مجلد `dist` على استضافة HTTPS. الكاميرا والموقع والمشاركة تتطلب سياقًا آمنًا؛ HTTP بعنوان الشبكة المحلية لا يكفي.
2. افتح التطبيق في Safari واختر مشاركة ← إضافة إلى الشاشة الرئيسية.
3. اسمح بالكاميرا والموقع، ثم أدخل Project Name وStage Name وAsset ID.
4. التقط صورة أو اختر Video وابدأ التسجيل ثم أوقفه لحفظ الملف. التسجيل دون صوت، بصيغة MP4 أو WebM حسب دعم المتصفح.
5. افتح Records، واختر اليوم المحلي، ثم صدّر ZIP يحتوي `records.csv` ومجلد `media`.
6. زر Share location يفتح قائمة المشاركة؛ اختر WhatsApp إذا كان مثبتًا ومتاحًا ضمن القائمة. عند غياب Web Share يُنسخ نص الموقع للحافظة.

بعد تحميل التطبيق أول مرة وتفعيل Service Worker، يمكن فتحه دون اتصال. يحتاج إرسال الموقع عبر WhatsApp اتصالًا، وقد تتأخر قراءة GPS دون شبكة.

## البيانات والإحداثيات

- تُرسم الصورة الأصلية على Canvas وتُدمج معها بيانات المشروع والتاريخ والوقت المحلي وWGS84 وUTM ودقة الموقع، ثم تُحفظ كـJPEG.
- الفيديو الجديد، على المتصفحات الداعمة، يُسجّل من Canvas مختوم فعليًا باسم MQSIO ووقت متجدد وGPS صالح وأسماء الموقع المتاحة. السجل وCSV يحتفظان بلقطة البيانات عند **بدء التسجيل**؛ الفيديو يعرض آخر قراءة صالحة أثناء التسجيل. الفيديوهات القديمة لا تتغير.
- WGS84 يمثل خط العرض والطول. UTM يحسب Zone ونصف الكرة والإحداثيات بالمتر، مع استثناءات النرويج وسفالبارد. التغطية من 80° جنوبًا إلى 84° شمالًا؛ خارجها تُحفظ WGS84 فقط.
- لا تُستخدم قراءة GPS أقدم من دقيقة أو قراءة بعد خطأ GPS عند الالتقاط أو المشاركة. يمكن الالتقاط دون GPS مع توضيح ذلك على الصورة والسجل.
- الصور والفيديو وبياناتها في IndexedDB؛ إعدادات المشروع في localStorage. لا يوجد رفع للوسائط أو تحليلات أو Backend. الإثراء الاختياري بأسماء المواقع فقط قد يرسل إحداثيات GPS بعد موافقة صريحة؛ التصوير والتخزين يعملان بدونه.
- اليوم في التصدير هو يوم الالتقاط بالتوقيت المحلي. CSV يحفظ ISO UTC كذلك ويحتوي مسار كل ملف وسطرًا لكل سجل، مع معالجة علامات الاقتباس وحماية الخلايا من صيغ الجداول.

**صدّر نسخًا احتياطية بانتظام:** قد يحذف Safari بيانات الموقع عند نقص المساحة أو حذف بيانات التصفح. الحذف من Records نهائي. تصدير التسجيلات الكبيرة يستخدم الذاكرة؛ يُفضّل تسجيل مقاطع قصيرة وتصديرها دوريًا.

## البنية

- `src/App.tsx`: واجهة التطبيق وتدفق الكاميرا والتسجيل والمشاركة والتصدير.
- `src/domain.ts`: أنواع السجلات وتحويل UTM وإنشاء CSV.
- `src/storage.ts`: حفظ الملفات والسجلات واسترجاعها وحذفها عبر IndexedDB.
- `src/style.css`: الهوية البصرية والواجهة المتجاوبة بالألوان المعتمدة.
- `vite.config.ts` و`public/`: إعداد PWA والتخزين المؤقت والأيقونات.
- `src/*.test.ts`: اختبارات التحويلات وCSV والتخزين.
- `e2e/app.spec.ts`: اختبارات الإنتاج بكاميرا وموقع محاكيين، واستعادة السجلات وتصدير ZIP والعمل دون اتصال ورفض إذن الكاميرا.

يلزم اختبار نهائي على iPhone فعلي للتحقق من صلاحيات Safari، وترميز الفيديو، والحفظ في Files، وظهور WhatsApp في قائمة المشاركة. اختبارات Chromium لا تثبت سلوك عتاد iPhone.

## الهوية البصرية المعتمدة

الأيقونات `public/mqsio-icon-{180,192,512}.png` ناتجة عن تصغير الأصل المعتمد `صورة ChatGPT 5 نوفمبر 2026، 09_39_27 م.png` دون قص أو إعادة رسم أو تغيير ألوان. ملف `public/mqsio-full-logo.png` مطابق بايتًا ببايت للشعار الكامل `صورة ChatGPT 5 نوفمبر 2026، 09_39_55 م.png`. يُستخدم الشعار الكامل في البداية والاسترداد، والأيقونة في Home Screen وmanifest وApple touch icon.

الأصول القديمة محفوظة للتوافق مع المراجع السابقة. لم يتغير `start_url` أو `scope` أو رابط Vercel أو اسم المستودع، ولم يُضف manifest ID جديد. تحديث الأيقونة/اسم Home Screen قد يتأخر حسب نظام التشغيل؛ **لا يلزم حذف التطبيق أو إعادة تثبيته أو مسح بيانات الموقع**. الألوان والخطوط وتخطيط الواجهة الحالي محفوظة.

## Export Inspection Report

أدخل **Prepared By** و**Job Title** من بطاقة Inspection report settings. تُحفظ هذه الإعدادات محليًا بشكل مستقل عن إعدادات الكاميرا، وتُستخدم القيم الحالية عند إنشاء التقرير.

من Records:

1. اختر اليوم من Record date.
2. في Export Inspection Report اختر Excel (`.xlsx`) أو Word (`.docx`).
3. اختر Selected day أو All available records، ثم اضغط Export Inspection Report.
4. يُنزّل ملف التقرير محليًا. يبقى زر CSV + media ZIP خيارًا منفصلًا كما كان.

العنوان **Periodic Fence Inspection**. الأعمدة، بالترتيب: Photo Number، UTM X، UTM Y، Date، Time، Field Activity، Photo، Stage Number. قيمة Field Activity ثابتة **Inspection**. تُدرج الصور المختومة فعليًا، وتُستبعد جميع الفيديوهات. رقم الصورة تسلسلي داخل التقرير، وStage Number يستخدم قيمة Stage name المحفوظة مع الصورة كما أُدخلت، مع الحفاظ على الأصفار الأولى. التاريخ هو يوم الالتقاط المحفوظ، والوقت يعرض بالتوقيت المحلي للجهاز.

قيم UTM في Excel أرقام فعلية بالمتر، وتظهر منطقة UTM ونصف الكرة في سطر معلومات التقرير؛ لا تُخلط المناطق دون ذكرها. تُترك خلايا الإحداثيات فارغة عند غياب قراءة صالحة، مع تنبيه يوضح عدد الصور المعنية، دون اختلاق إحداثيات أو استبعاد صورها.

المكتبتان **ExcelJS** و**docx** تنشئان الملفات على الجهاز، داخل Web Worker قابل للإلغاء. يجري تجهيز الصور بالتتابع، بحد أقصى 1200×1200 مع حفظ النسبة وكامل الختم. الصور الأصلية في IndexedDB لا تتغير. عند تجاوز 48 MiB من صور التقرير المجهزة، يتوقف التصدير برسالة لاختيار يوم محدد. توجد مهلة ثلاث دقائق لإنشاء المستند، ورسائل واضحة عند تلف صورة أو تعذر التوليد؛ لا تُحذف السجلات عند الفشل. يُفضّل إبقاء التطبيق في المقدمة أثناء التصدير على iPhone.

Excel مهيأ لطباعة A4 أفقي، بعناوين مكررة وصفوف صور غير متداخلة، وقيم المجهز في النهاية والتذييل. Word يحتوي رأسًا بالشعارين والعنوان، وعناوين جدول متكررة وصفوف لا تنقسم بين الصفحات، وPrepared By وJob Title في نهاية التقرير والتذييل مع ترقيم الصفحات. قد تختلف فواصل الصفحات قليلًا حسب برنامج Office والخطوط المثبتة.

### أصول الشعارات

- NEOM Nature Reserve، يسار الرأس: `02_logo_3x_navy.png` في جذر المستودع.
- Gulf Skyline، يمين الرأس: `file_00000000e30c82438648e9277477d724 (2).png` في جذر المستودع.

تُضمّن بايتات PNG الأصلية في المستندات دون إعادة رسم أو قص أو تغيير ألوان. تضم ذاكرة PWA المؤقتة الشعارات ومكتبات إنشاء التقارير، ليعمل التصدير دون اتصال بعد اكتمال تهيئة التطبيق أول مرة.

التحقق الآلي يشمل اختيار اليوم/الكل، استبعاد الفيديوهات، UTM الرقمي، الإعدادات، وإنتاج الملفين من صور JPEG مختومة التقطتها كاميرا الاختبار، مع فحص الصور والشعارات المضمنة وتكرار العناوين والتذييل والتعامل مع صورة غير قابلة للقراءة. اختبارات المتصفح تستخدم كاميرا وGPS محاكيين؛ لا تستبدل تجربة Safari وFiles على iPhone فعلي.

## Safari startup and GPS recovery

Startup no longer opens IndexedDB during module evaluation. Database access is lazy, failures are reported through Retry Records, and an abnormally terminated connection can reopen on retry. The database remains `geocamera`, version **1**, with its existing `records` store; no migration or data reset was added. Project and preparer settings are written only after user edits, so a temporary read failure cannot overwrite existing saved values with defaults.

The original 1.2-second branded splash is unchanged during successful startup. A small inline watchdog operates independently of the application modules, IndexedDB and GPS. Module errors, a 12-second startup stall, and React render failures show recovery controls rather than an indefinite splash. **Retry Startup** reloads the same profile; **Check for Update** requests a Service Worker update. Neither clears storage, deletes caches, nor unregisters workers. Vercel headers require revalidation of HTML and SW registration scripts while retaining the existing offline PWA behavior.

GPS begins after the splash closes. **Retry GPS** clears only the previous GPS watch and requests a new fix. Denied, timed-out, unsupported and unavailable positioning have separate guidance; synchronous browser API restrictions are caught. Safari's per-site location permission is distinct from global Location Services and Precise Location. The Location card explains iPhone Safari, Home Screen app and macOS Safari settings. Changing a denied site permission may be required before Safari prompts again; the app cannot override that permission.

The camera interface can load without GPS. Invalid positions are rejected, fixes older than a minute are not used for new captures or sharing, and missing coordinates remain missing. Existing WGS84/UTM conversion and report/ZIP exports are unchanged.

### Diagnosis and validation scope

Before the fix, injecting an IndexedDB `SecurityError` during module evaluation reproduced the reported symptom: an uncaught exception, the original splash still visible, and no mounted camera interface. This is a **verified failure path**, not proof that the affected physical iPhone threw that particular exception. Stale deployment assets, WebKit-specific compatibility, and the affected device's per-site/OS location permission remain unconfirmed without inspecting that device.

Regression tests cover blocked IndexedDB and retry, module-loading failure and reload, stalled scripts, React render errors, temporarily denied settings reads, denied GPS followed by a real fix, timeout/unavailable GPS, synchronous SecurityError, missing GPS APIs and stale fixes. Preservation checks compare existing photo/video blob bytes, project/preparer settings and DB version before and after recovery. Existing camera, Excel, Word, CSV, ZIP and offline tests remain in the suite.

```sh
npm run typecheck
npm run build
npm test
npm run test:e2e
# With the Playwright WebKit binary and its system prerequisites installed:
npm run test:webkit
```

No actual iPhone was available for this change. The current environment's network proxy denied inspection of `geocamera-chi.vercel.app` and denied WebKit downloads from `cdn.playwright.dev` / `playwright.download.prss.microsoft.com`. Chromium regression results must not be described as WebKit or physical-iPhone validation. The WebKit configuration runs the same startup/GPS recovery suite once that browser is available.

## MQSIO v2.0: نطاق التحديث المحمي

التغييرات الخمسة فقط: الهوية المرئية، ختم الفيديو داخل الإطارات، Country/City، ملاءمة صور التقرير، وتسلسل Asset ID. النسخة مهيأة للمراجعة على `feature/mqsio-v2`؛ لا تُدمج أو تُنشر إلى الإنتاج دون موافقة منفصلة.

### Asset ID: تسلسل مشترك للصور والفيديو

- المعرّف الرقمي أو المختلط يُحفظ كما هو في أول لقطة، ثم تزداد **آخر مجموعة أرقام فقط** بعد نجاح معاملة IndexedDB: `SITE_02_PH_009` ← `SITE_02_PH_010`، و`FENCE-099` ← `FENCE-100`. تُحفظ المسافات والبادئات واللاحقات والأصفار الأولى؛ الأرقام العربية والهندية مدعومة كذلك.
- إذا لم توجد أرقام وكان الحقل غير فارغ، يُلحق `001` **بنسخة المعرّف المخصصة للقطة الأولى**: الحقل `FENCE` ينتج سجلًا وختمًا باسم `FENCE001`، ثم يصبح الحقل `FENCE002` بعد نجاح الحفظ. الفشل أو الإلغاء يُبقي الحقل `FENCE`. الحقل الفارغ يحتفظ بالسلوك السابق دون فرض معرّف.
- تُحفظ القيمة التالية في مفتاح الإعدادات الحالي `geocamera-settings`. لا تُعدل السجلات القديمة ولا معرّفاتها. تمنع حراسة العمليات ومعاملة IndexedDB المتسلسلة تكرار معرّف بين اللقطات الجديدة المتزامنة؛ عند تعارض قيمة سبق استخدامها في التسلسل الجديد، تُرفض اللقطة برسالة لاختيار بداية جديدة، دون إعادة ختم معرّف مختلف أو زيادة العداد.
- التعديل اليدوي أثناء الترميز لا يُستبدل بقيمة قديمة عند اكتمال الحفظ. تتقدم القيمة فقط بعد الحفظ الفعلي؛ إذا رفض المتصفح كتابة الإعدادات، يظهر تنبيه لمراجعة المعرّف التالي. تظل قاعدة البيانات `geocamera` بالإصدار 1 ومخزن `records` ومفتاح السجل `id` كما كانت. ترتيب Photo Number في التقرير لم يتغير؛ Asset ID المخصص يظهر في الصورة المضمنة وCSV.

### الفيديو المختوم

`src/media/recording.ts` يلتقط إطارات الكاميرا إلى Canvas ويرسم الختم قبل ترميز stream الخاص بالـCanvas، دون مسار صوت. تُفضّل MP4/H.264 حين يدعمها المتصفح، ثم البدائل المعلنة المدعومة. يجري التعرف على الحاوية الفعلية MP4/WebM والتحقق من قابلية فكها ووجود نطاق الختم قبل حفظها؛ الامتداد يطابق MIME الفعلي.

الدقة القصوى 1280 بكسل على الضلع الأطول، و24 إطارًا/ثانية مستهدفة. يتوقف التسجيل بأمان عند مغادرة المقدمة أو تغير الاتجاه/الدقة أو انقطاع الكاميرا/الإطارات، أو بعد ثلاث دقائق/نحو 64 MiB. يُحفظ المقطع المختوم الجزئي إذا أمكن التحقق منه مع رسالة بسبب التوقف؛ فشل الترميز أو إلغاء المكوّن لا يُحفظ ولا يزيد Asset ID. قد يعلّق iOS الصفحة قبل إنهاء الملف؛ أبقِ التطبيق في المقدمة ولا تعتمد على التسجيل أثناء القفل. المتصفح الذي يفتقد دعم Canvas capture/MediaRecorder أو لا ينتج ختمًا موثوقًا يعرض تحذيرًا وخيار **Use stamped photos**؛ لا يُحفظ فيديو خام على أنه مختوم.

### Country/City: المزود والخصوصية والعمل دون اتصال

الخيار داخل **Location → Country & city (optional)**، وهو متوقف افتراضيًا. تشغيل **Use online place names** هو موافقة لإرسال GPS الحالي إلى واجهة BigDataCloud العميلة المجانية:

`https://api.bigdatacloud.net/data/reverse-geocode-client`

[توثيق الخدمة وشروطها الحالية](https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api). لا يوجد حساب أو مفتاح مدفوع/سري أو خدمة Backend في المشروع. الواجهة مخصصة لطلبات إحداثيات الجهاز من المتصفح، وليست لجلب أسماء دفعات نقاط خارجية. استخدامها خاضع لشروط وسياسة خصوصية المزود السارية، وليست هناك ضمانة توافر أو دقة مساحية أو حصة غير محدودة؛ قد يرفض المزود الطلبات أو يحدّها. مزود الخدمة يرى IP وإحداثيات الطلب؛ لا يُرسل التطبيق الصور أو الفيديو أو أسماء المشروع، ولا يرسل cookies أو referrer.

حراسة العميل تحدّ الطلبات إلى مرة بالدقيقة في الاستخدام المعتاد وتستمر عبر إعادة الفتح، ولا تُطلب الأسماء في كل إطار فيديو. الحصة الفعلية لدى المزود مستقلة عن هذا الحد. تُخزن آخر 50 نتيجة محليًا، وتُستخدم حتى 30 يومًا إذا كانت القراءة الحالية ضمن 20 مترًا من نقطة البحث؛ لا تُعاد تسمية موقع انتقل بعيدًا استنادًا إلى نتيجة قديمة. القراءات الأقدم من دقيقة أو غير المتاحة لا تُعامل كموقع حالي، والقراءات الخشنة جدًا لا تُستخدم لإثراء الأسماء. يمكن سحب الموافقة، وتُحترم أيضًا عند تغيرها في علامة تبويب أخرى.

يستخدم التطبيق حقول `countryName` و`city` و`principalSubdivision` الصريحة فقط؛ لا يستبدل مدينة مفقودة باسم أقرب `locality` أو بموقع IP. هذه تسميات إدارية من مزود خارجي وليست إثباتًا لحدود المدينة. عند غياب GPS/الإنترنت أو فشل الخدمة/انتهاء المهلة تظهر `Unavailable`، دون انتظار أو منع التصوير. الاسم الناجح يُثبت في السجل الجديد ولا يغير السجلات القديمة بعد ذلك. أُلحقت أعمدة `country`, `city`, `area` بعد أعمدة CSV السابقة، مع إبقاء بنية ZIP ومسارات الوسائط كما كانت. المفتاح الاختياري الجديد `geocamera-place-names-v1` خاص بالموافقة والتخزين المؤقت، ولا يستبدل أي مفتاح قائم.

### ملاءمة صور التقارير

الأعمدة والألوان والخطوط والشعاران والعنوان والقيم والإعدادات كما كانت. تتوسع الصورة نسبيًا داخل عرض خلية Photo القائم، ويزداد ارتفاع صف الصورة الطولية فقط عند الحاجة ضمن حدود الصفحة. كل الصورة والختم محفوظان دون قص أو تمدد؛ تُحسب إزاحات Excel وحدود الصورة على الصف الفعلي، وتُمنع صفوف Word من الانقسام. لا يتحول Photo Number إلى Asset ID ولا يتغير ترتيب بيانات التقرير.
