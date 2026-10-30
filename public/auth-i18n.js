/* ============================================================
   WAWE JOURNAL — auth-i18n.js (login / register / şifre sıfırlama)
   Dil, landing'de seçilenle aynı: localStorage ww_language / ww_lang
   (bkz. index-i18n.js). Head'de senkron yüklenir; sayfa script'i
   markup'tan hemen sonra apply() çağırır, İngilizce metin hiç görünmez.
   Markup: data-at (metin), data-at-html, data-at-ph (placeholder),
   data-at-aria (aria-label), .auth-side[data-at-title] (sekme başlığı).
   JS mesajları: authT('key').
   ============================================================ */
(function () {
  'use strict';

  var translations = {
    en: {
      common: {
        home_aria: 'Wawe Journal Home',
        or: 'or',
        email_label: 'Email address',
        email_ph: 'Enter your email address',
        password_label: 'Password',
        continue_google: 'Continue with Google',
        redirect_google: 'Redirecting to Google...',
        show_pw: 'Show password',
        hide_pw: 'Hide password',
        close: 'Close',
        back_login: 'Back to login',
        visual_1: 'Track every trade.',
        visual_2: 'Master your discipline.',
        pt_journal: 'Trade journal',
        pt_analytics: 'Analytics',
        pt_backtest: 'Backtesting'
      },
      login: {
        doc_title: 'Login – Wawe Journal',
        title: 'Welcome back',
        sub: 'Log in to Wawe Journal to continue.',
        password_ph: 'Enter your password',
        forgot: 'Forgot password?',
        submit: 'Log In',
        submitting: 'Logging in…',
        done: 'Login Successful! ✓',
        welcome: 'Welcome back! Redirecting to dashboard...',
        no_account: "Don't have an account?",
        signup: 'Sign up'
      },
      register: {
        doc_title: 'Sign Up – Wawe Journal',
        title: 'Create your account',
        sub: 'Start journaling your trades in minutes.',
        username_label: 'Username',
        username_ph: 'e.g., traderjohn',
        password_ph: 'At least 6 characters',
        confirm_label: 'Confirm password',
        confirm_ph: 'Re-enter password',
        submit: 'Sign Up',
        submitting: 'Signing up…',
        done: 'Account Created! ✓',
        created: 'Account created successfully! Redirecting to dashboard...',
        terms_html: 'By signing up, you agree to our <a href="terms.html">Terms of Use</a>.',
        have_account: 'Already have an account?',
        login: 'Log in'
      },
      forgot: {
        doc_title: 'Reset Password – Wawe Journal',
        title: 'Reset your password',
        sub: "Enter your email and we'll send you a link to reset your password.",
        submit: 'Send Reset Link',
        submitting: 'Sending...',
        sent: 'Password reset link sent! Check your email.',
        remembered: 'Remembered it?'
      },
      update: {
        doc_title: 'Update Password – Wawe Journal',
        title: 'Set a new password',
        sub: 'Choose a new password for your account.',
        verifying: 'Verifying your reset link...',
        new_label: 'New password',
        submit: 'Update Password',
        submitting: 'Updating...',
        updated: 'Password updated successfully! Redirecting to login...',
        weak: 'Weak',
        medium: 'Medium',
        strong: 'Strong',
        link_expired: 'Invalid or expired reset link. Please request a new one.',
        link_invalid: 'Invalid reset link. Please request a new one.',
        link_missing: 'No reset link detected. Please use the link from your email.',
        use_link: 'Please use the reset link from your email.'
      },
      err: {
        email_password_required: 'Email and password are required.',
        email_required: 'Email is required.',
        email_turkish: 'Email cannot contain Turkish characters.',
        email_invalid: 'Please enter a valid email address.',
        username_required: 'Username is required.',
        username_short: 'Username must be at least 3 characters.',
        username_invalid: 'Username contains invalid characters.',
        password_short: 'Password must be at least 6 characters.',
        password_mismatch: 'Passwords do not match.',
        turnstile_required: 'Please complete the security verification (Turnstile).',
        turnstile_failed: 'Security verification failed. Please check the box again.',
        too_many: 'Too many attempts. Please try again in 15 minutes.',
        invalid_credentials: 'Invalid email or password.',
        deactivated: 'Your account has been deactivated.',
        login_failed: 'Login failed. Please try again.',
        register_failed: 'Registration failed. Please try again.',
        email_taken: 'This email address is already registered.',
        username_taken: 'This username is already taken.',
        network: 'Network error. Please try again.',
        server: 'Unable to connect to the server. Please try again.',
        unexpected: 'An unexpected error occurred. Please try again.',
        generic: 'An error occurred. Please try again.',
        auth_init: 'Authentication service is initializing, please try again.',
        google_login_failed: 'Google login failed: ',
        google_signup_failed: 'Google sign up failed: ',
        google_db: 'Google sign-in failed: Database error saving new user. Please contact support.'
      }
    },

    tr: {
      common: {
        home_aria: 'Wawe Journal Ana Sayfa',
        or: 'veya',
        email_label: 'E-posta adresi',
        email_ph: 'E-posta adresinizi girin',
        password_label: 'Şifre',
        continue_google: 'Google ile devam et',
        redirect_google: 'Google\'a yönlendiriliyor...',
        show_pw: 'Şifreyi göster',
        hide_pw: 'Şifreyi gizle',
        close: 'Kapat',
        back_login: 'Girişe dön',
        visual_1: 'Her işlemini kaydet.',
        visual_2: 'Disiplinini zirveye taşı.',
        pt_journal: 'İşlem günlüğü',
        pt_analytics: 'Analiz',
        pt_backtest: 'Backtest'
      },
      login: {
        doc_title: 'Giriş – Wawe Journal',
        title: 'Tekrar hoş geldin',
        sub: 'Devam etmek için Wawe Journal\'a giriş yap.',
        password_ph: 'Şifrenizi girin',
        forgot: 'Şifremi unuttum',
        submit: 'Giriş Yap',
        submitting: 'Giriş yapılıyor…',
        done: 'Giriş başarılı! ✓',
        welcome: 'Tekrar hoş geldin! Panele yönlendiriliyorsun...',
        no_account: 'Hesabın yok mu?',
        signup: 'Kayıt ol'
      },
      register: {
        doc_title: 'Kayıt Ol – Wawe Journal',
        title: 'Hesabını oluştur',
        sub: 'İşlemlerini dakikalar içinde kaydetmeye başla.',
        username_label: 'Kullanıcı adı',
        username_ph: 'örn. traderjohn',
        password_ph: 'En az 6 karakter',
        confirm_label: 'Şifreyi onayla',
        confirm_ph: 'Şifreyi tekrar girin',
        submit: 'Kayıt Ol',
        submitting: 'Kayıt olunuyor…',
        done: 'Hesap oluşturuldu! ✓',
        created: 'Hesabın oluşturuldu! Panele yönlendiriliyorsun...',
        terms_html: 'Kayıt olarak <a href="terms.html">Kullanım Koşulları</a>\'nı kabul etmiş olursun.',
        have_account: 'Zaten hesabın var mı?',
        login: 'Giriş yap'
      },
      forgot: {
        doc_title: 'Şifre Sıfırlama – Wawe Journal',
        title: 'Şifreni sıfırla',
        sub: 'E-posta adresini gir, sana şifre sıfırlama linki gönderelim.',
        submit: 'Sıfırlama Linki Gönder',
        submitting: 'Gönderiliyor...',
        sent: 'Şifre sıfırlama linki gönderildi! E-postanı kontrol et.',
        remembered: 'Hatırladın mı?'
      },
      update: {
        doc_title: 'Şifre Güncelle – Wawe Journal',
        title: 'Yeni şifre belirle',
        sub: 'Hesabın için yeni bir şifre seç.',
        verifying: 'Sıfırlama linkin doğrulanıyor...',
        new_label: 'Yeni şifre',
        submit: 'Şifreyi Güncelle',
        submitting: 'Güncelleniyor...',
        updated: 'Şifren güncellendi! Giriş sayfasına yönlendiriliyorsun...',
        weak: 'Zayıf',
        medium: 'Orta',
        strong: 'Güçlü',
        link_expired: 'Sıfırlama linki geçersiz veya süresi dolmuş. Lütfen yenisini iste.',
        link_invalid: 'Geçersiz sıfırlama linki. Lütfen yenisini iste.',
        link_missing: 'Sıfırlama linki bulunamadı. Lütfen e-postandaki linki kullan.',
        use_link: 'Lütfen e-postandaki sıfırlama linkini kullan.'
      },
      err: {
        email_password_required: 'E-posta ve şifre gerekli.',
        email_required: 'E-posta gerekli.',
        email_turkish: 'E-posta Türkçe karakter içeremez.',
        email_invalid: 'Lütfen geçerli bir e-posta adresi gir.',
        username_required: 'Kullanıcı adı gerekli.',
        username_short: 'Kullanıcı adı en az 3 karakter olmalı.',
        username_invalid: 'Kullanıcı adı geçersiz karakterler içeriyor.',
        password_short: 'Şifre en az 6 karakter olmalı.',
        password_mismatch: 'Şifreler eşleşmiyor.',
        turnstile_required: 'Lütfen güvenlik doğrulamasını (Turnstile) tamamla.',
        turnstile_failed: 'Güvenlik doğrulaması başarısız. Lütfen kutucuğu tekrar işaretle.',
        too_many: 'Çok fazla deneme. Lütfen 15 dakika sonra tekrar dene.',
        invalid_credentials: 'E-posta veya şifre hatalı.',
        deactivated: 'Hesabın devre dışı bırakılmış.',
        login_failed: 'Giriş başarısız. Lütfen tekrar dene.',
        register_failed: 'Kayıt başarısız. Lütfen tekrar dene.',
        email_taken: 'Bu e-posta adresi zaten kayıtlı.',
        username_taken: 'Bu kullanıcı adı zaten alınmış.',
        network: 'Ağ hatası. Lütfen tekrar dene.',
        server: 'Sunucuya bağlanılamadı. Lütfen tekrar dene.',
        unexpected: 'Beklenmeyen bir hata oluştu. Lütfen tekrar dene.',
        generic: 'Bir hata oluştu. Lütfen tekrar dene.',
        auth_init: 'Kimlik doğrulama servisi başlatılıyor, lütfen tekrar dene.',
        google_login_failed: 'Google ile giriş başarısız: ',
        google_signup_failed: 'Google ile kayıt başarısız: ',
        google_db: 'Google ile giriş başarısız: Yeni kullanıcı kaydedilirken veritabanı hatası oluştu. Lütfen destekle iletişime geç.'
      }
    },

    de: {
      common: {
        home_aria: 'Wawe Journal Startseite',
        or: 'oder',
        email_label: 'E-Mail-Adresse',
        email_ph: 'E-Mail-Adresse eingeben',
        password_label: 'Passwort',
        continue_google: 'Weiter mit Google',
        redirect_google: 'Weiterleitung zu Google...',
        show_pw: 'Passwort anzeigen',
        hide_pw: 'Passwort verbergen',
        close: 'Schließen',
        back_login: 'Zurück zur Anmeldung',
        visual_1: 'Jeden Trade erfassen.',
        visual_2: 'Disziplin meistern.',
        pt_journal: 'Trading-Journal',
        pt_analytics: 'Analysen',
        pt_backtest: 'Backtesting'
      },
      login: {
        doc_title: 'Anmelden – Wawe Journal',
        title: 'Willkommen zurück',
        sub: 'Melde dich bei Wawe Journal an, um fortzufahren.',
        password_ph: 'Passwort eingeben',
        forgot: 'Passwort vergessen?',
        submit: 'Anmelden',
        submitting: 'Anmeldung läuft…',
        done: 'Anmeldung erfolgreich! ✓',
        welcome: 'Willkommen zurück! Weiterleitung zum Dashboard...',
        no_account: 'Noch kein Konto?',
        signup: 'Registrieren'
      },
      register: {
        doc_title: 'Registrieren – Wawe Journal',
        title: 'Konto erstellen',
        sub: 'Starte in wenigen Minuten mit deinem Trading-Journal.',
        username_label: 'Benutzername',
        username_ph: 'z. B. traderjohn',
        password_ph: 'Mindestens 6 Zeichen',
        confirm_label: 'Passwort bestätigen',
        confirm_ph: 'Passwort erneut eingeben',
        submit: 'Registrieren',
        submitting: 'Registrierung läuft…',
        done: 'Konto erstellt! ✓',
        created: 'Konto erfolgreich erstellt! Weiterleitung zum Dashboard...',
        terms_html: 'Mit der Registrierung akzeptierst du unsere <a href="terms.html">Nutzungsbedingungen</a>.',
        have_account: 'Bereits ein Konto?',
        login: 'Anmelden'
      },
      forgot: {
        doc_title: 'Passwort zurücksetzen – Wawe Journal',
        title: 'Passwort zurücksetzen',
        sub: 'Gib deine E-Mail-Adresse ein und wir senden dir einen Link zum Zurücksetzen.',
        submit: 'Link senden',
        submitting: 'Wird gesendet...',
        sent: 'Link zum Zurücksetzen gesendet! Prüfe dein Postfach.',
        remembered: 'Doch wieder eingefallen?'
      },
      update: {
        doc_title: 'Passwort ändern – Wawe Journal',
        title: 'Neues Passwort festlegen',
        sub: 'Wähle ein neues Passwort für dein Konto.',
        verifying: 'Link wird überprüft...',
        new_label: 'Neues Passwort',
        submit: 'Passwort ändern',
        submitting: 'Wird aktualisiert...',
        updated: 'Passwort erfolgreich geändert! Weiterleitung zur Anmeldung...',
        weak: 'Schwach',
        medium: 'Mittel',
        strong: 'Stark',
        link_expired: 'Ungültiger oder abgelaufener Link. Bitte fordere einen neuen an.',
        link_invalid: 'Ungültiger Link. Bitte fordere einen neuen an.',
        link_missing: 'Kein Link erkannt. Bitte nutze den Link aus deiner E-Mail.',
        use_link: 'Bitte nutze den Link aus deiner E-Mail.'
      },
      err: {
        email_password_required: 'E-Mail und Passwort sind erforderlich.',
        email_required: 'E-Mail ist erforderlich.',
        email_turkish: 'Die E-Mail darf keine türkischen Sonderzeichen enthalten.',
        email_invalid: 'Bitte gib eine gültige E-Mail-Adresse ein.',
        username_required: 'Benutzername ist erforderlich.',
        username_short: 'Der Benutzername muss mindestens 3 Zeichen lang sein.',
        username_invalid: 'Der Benutzername enthält ungültige Zeichen.',
        password_short: 'Das Passwort muss mindestens 6 Zeichen lang sein.',
        password_mismatch: 'Die Passwörter stimmen nicht überein.',
        turnstile_required: 'Bitte schließe die Sicherheitsprüfung (Turnstile) ab.',
        turnstile_failed: 'Sicherheitsprüfung fehlgeschlagen. Bitte das Kästchen erneut anklicken.',
        too_many: 'Zu viele Versuche. Bitte versuche es in 15 Minuten erneut.',
        invalid_credentials: 'E-Mail oder Passwort ist falsch.',
        deactivated: 'Dein Konto wurde deaktiviert.',
        login_failed: 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.',
        register_failed: 'Registrierung fehlgeschlagen. Bitte versuche es erneut.',
        email_taken: 'Diese E-Mail-Adresse ist bereits registriert.',
        username_taken: 'Dieser Benutzername ist bereits vergeben.',
        network: 'Netzwerkfehler. Bitte versuche es erneut.',
        server: 'Keine Verbindung zum Server. Bitte versuche es erneut.',
        unexpected: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.',
        generic: 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.',
        auth_init: 'Der Anmeldedienst wird gestartet, bitte versuche es erneut.',
        google_login_failed: 'Google-Anmeldung fehlgeschlagen: ',
        google_signup_failed: 'Google-Registrierung fehlgeschlagen: ',
        google_db: 'Google-Anmeldung fehlgeschlagen: Datenbankfehler beim Anlegen des Kontos. Bitte kontaktiere den Support.'
      }
    }
  };

  var lang = 'en';
  try {
    lang = localStorage.getItem('ww_language') || localStorage.getItem('ww_lang') || 'en';
  } catch (e) {}
  if (!translations[lang]) lang = 'en';

  function lookup(dict, key) {
    return key.split('.').reduce(function (o, k) {
      return o && o[k] !== undefined ? o[k] : undefined;
    }, dict);
  }

  function t(key) {
    var v = lookup(translations[lang], key);
    if (v === undefined) v = lookup(translations.en, key);
    return v === undefined ? key : v;
  }

  function each(sel, fn) {
    var list = document.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) fn(list[i]);
  }

  function apply() {
    document.documentElement.lang = lang;
    each('[data-at]', function (el) { el.textContent = t(el.getAttribute('data-at')); });
    each('[data-at-html]', function (el) { el.innerHTML = t(el.getAttribute('data-at-html')); });
    each('[data-at-ph]', function (el) { el.placeholder = t(el.getAttribute('data-at-ph')); });
    each('[data-at-aria]', function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-at-aria'))); });
    var side = document.querySelector('[data-at-title]');
    if (side) document.title = t(side.getAttribute('data-at-title'));
  }

  window.wwAuthI18n = { lang: lang, t: t, apply: apply };
  window.authT = t;
})();
