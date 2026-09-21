package net.nn33.ledger;

import android.annotation.SuppressLint;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewFeature;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

public class MainActivity extends AppCompatActivity {

    /** 화면(index.html)이 서빙되는 오리진. localStorage 가 여기에 묶여 있으니 절대 바꾸지 말 것. */
    private static final String ORIGIN_HOST = "appassets.androidplatform.net";
    private static final String PREF = "app";

    private FrameLayout root;
    private WebView web;
    private ValueCallback<Uri[]> filePicker;
    private String pendingSave;
    private File liveDir, liveFile, mirrorFile;
    private long startedAt;
    private int insetTop, insetBottom; // CSS px

    /** 백업 가져오기(<input type="file">) */
    private final ActivityResultLauncher<Intent> pickFiles =
        registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            if (filePicker == null) return;
            Uri[] uris = null;
            Intent data = result.getData();
            if (result.getResultCode() == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    uris = new Uri[n];
                    for (int i = 0; i < n; i++) uris[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    uris = new Uri[]{data.getData()};
                }
            }
            filePicker.onReceiveValue(uris);
            filePicker = null;
        });

    /** 백업 내보내기 — 시스템 파일 저장 창(SAF). 저장소 권한이 필요 없다. */
    private final ActivityResultLauncher<String> createDoc =
        registerForActivityResult(new ActivityResultContracts.CreateDocument("application/json"), uri -> {
            boolean ok = false;
            if (uri != null && pendingSave != null) {
                try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                    if (out != null) {
                        out.write(pendingSave.getBytes(StandardCharsets.UTF_8));
                        ok = true;
                    }
                } catch (Exception ignored) {
                }
            }
            pendingSave = null;
            if (web != null) web.evaluateJavascript("window.__savedFile&&window.__savedFile(" + ok + ")", null);
        });

    /** 뒤로가기로 열려 있는 팝업·시트·전체화면을 먼저 닫게 하는 스크립트. 새 오버레이를 만들면 여기도 추가. */
    private static final String BACK_JS =
        "window.__back=function(){" +
        "var m=[['notifAlert','naCancel'],['bkAlert','bkCancel'],['grpAlert','grpCancel'],['gameChoose','gcCancel']," +
        "['sheet','fCancel'],['gSheet','gCancel'],['pSheet','pCancel'],['themeSheet','tDone']," +
        "['pickScreen','pkClose'],['calScreen','calClose']," +
        "['gDetail','gdClose'],['inboxSheet','ibClose']];" +
        "for(var i=0;i<m.length;i++){var el=document.getElementById(m[i][0]);" +
        "if(el&&el.classList.contains('open')){var b=document.getElementById(m[i][1]);" +
        "if(b){b.click();return true;}}}return false;};";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        // 시스템 바 뒤까지 그린다. 실제 여백은 인셋을 재서 페이지의 --sat/--sab 로 넘긴다.
        EdgeToEdge.enable(this);
        super.onCreate(state);
        startedAt = SystemClock.elapsedRealtime();

        liveDir = new File(getFilesDir(), "live");
        liveFile = new File(liveDir, "index.html");
        mirrorFile = new File(getFilesDir(), "mirror.json");
        ensureLiveCopy();

        root = new FrameLayout(this);
        web = new WebView(this);
        web.setBackgroundColor(0);
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets sb = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean imeOpen = ime.bottom > sb.bottom;
            // 키보드가 올라오면 그만큼 화면을 줄이고(입력칸이 가려지지 않게), 아니면 내비 바 밑까지 그린다
            v.setPadding(sb.left, 0, sb.right, imeOpen ? ime.bottom : 0);
            float den = getResources().getDisplayMetrics().density;
            insetTop = Math.round(sb.top / den);
            insetBottom = imeOpen ? 0 : Math.round(sb.bottom / den);
            pushInsets();
            return WindowInsetsCompat.CONSUMED;
        });

        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setSupportZoom(false);
        ws.setBuiltInZoomControls(false);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);

        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(ws, true);
        }

        // 내부 저장소와 assets 를 같은 https 오리진으로 서빙한다.
        // 오리진이 고정이라 앱을 갱신해도 localStorage 기록이 그대로 남는다.
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/live/", new WebViewAssetLoader.InternalStoragePathHandler(this, liveDir))
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            /** 우리 오리진 밖으로는 절대 이동하지 않는다 — JS 브리지가 다른 사이트에 노출되면 안 된다. */
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (u != null && ORIGIN_HOST.equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript(BACK_JS, null);
                pushInsets();
            }
        });

        // 백업 가져오기(<input type="file">) 에 필요하다
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (filePicker != null) filePicker.onReceiveValue(null);
                filePicker = cb;
                try {
                    pickFiles.launch(params.createIntent());
                } catch (Exception e) {
                    filePicker = null;
                    return false;
                }
                return true;
            }
        });

        // 알림 감지·백업·시스템 바를 화면(index.html)과 잇는 통로
        web.addJavascriptInterface(new Bridge(), "Android");

        web.loadUrl("https://" + ORIGIN_HOST + "/live/index.html");

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                web.evaluateJavascript("window.__back?window.__back():false", value -> {
                    if (!"true".equals(value)) finish();
                });
            }
        });

        if (BuildConfig.REMOTE_UPDATE) checkForUpdate();
    }

    /** 페이지의 안전 영역 변수(--sat/--sab)에 실측 인셋을 넣는다 */
    private void pushInsets() {
        if (web == null) return;
        web.evaluateJavascript(
            "document.documentElement.style.setProperty('--sat','" + insetTop + "px');" +
            "document.documentElement.style.setProperty('--sab','" + insetBottom + "px');", null);
    }

    /**
     * 내부 저장소의 index.html 을 준비한다.
     * APK 가 바뀌었으면(설치·업데이트) 항상 APK 안의 원본으로 되돌린다 — 스토어 빌드는 이 원본만 쓰고,
     * 개인 빌드는 이 위에 원격 업데이트를 덮어쓴다.
     */
    private void ensureLiveCopy() {
        SharedPreferences sp = getSharedPreferences(PREF, MODE_PRIVATE);
        if (liveFile.exists() && sp.getInt("apk_ver", 0) == BuildConfig.VERSION_CODE) return;
        copyBundledCopy();
        sp.edit().putInt("apk_ver", BuildConfig.VERSION_CODE).apply();
    }

    /** 앱에 들어 있는 원본을 내부 저장소로 복사 */
    private void copyBundledCopy() {
        try {
            if (!liveDir.exists() && !liveDir.mkdirs()) return;
            InputStream in = getAssets().open("index.html");
            FileOutputStream out = new FileOutputStream(liveFile);
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            out.close();
            in.close();
        } catch (Exception ignored) {
        }
    }

    /**
     * 원격 index.html 을 받아 내용이 바뀌었으면 교체한다. 실패해도 조용히 넘어간다.
     * 개인(debug) 빌드에서만 돈다. 스토어(release) 빌드는 BuildConfig.REMOTE_UPDATE 가 false 라
     * 항상 APK 안의 화면만 쓴다 — 원격 코드가 JS 브리지를 만지는 길을 막기 위해서다.
     */
    private void checkForUpdate() {
        final String url = getString(R.string.update_url);
        if (url.contains("OWNER/REPO") || !url.startsWith("https://")) return;

        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(15000);
                conn.setRequestProperty("Cache-Control", "no-cache");
                if (conn.getResponseCode() != 200) return;

                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                InputStream in = conn.getInputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
                in.close();
                byte[] fresh = bos.toByteArray();

                // 너무 작거나 우리 페이지가 아니면(오류 페이지 등) 무시
                if (fresh.length < 2000) return;
                String head = new String(fresh, 0, Math.min(fresh.length, 400), StandardCharsets.UTF_8);
                if (!head.contains("<title>가계부</title>")) return;
                if (Arrays.equals(fresh, readFile(liveFile))) return;

                File tmp = new File(liveDir, "index.tmp");
                FileOutputStream out = new FileOutputStream(tmp);
                out.write(fresh);
                out.close();
                if (!tmp.renameTo(liveFile)) return;

                // 켠 직후면 바로 적용, 쓰던 중이면 다음 실행 때 적용
                final boolean justLaunched = SystemClock.elapsedRealtime() - startedAt < 12000;
                runOnUiThread(() -> {
                    if (justLaunched) {
                        Toast.makeText(this, "새 버전을 받았습니다", Toast.LENGTH_SHORT).show();
                        web.reload();
                    } else {
                        Toast.makeText(this, "새 버전은 다음 실행 때 적용됩니다", Toast.LENGTH_SHORT).show();
                    }
                });
            } catch (Exception ignored) {
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private static byte[] readFile(File f) {
        try (FileInputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            return bos.toByteArray();
        } catch (Exception e) {
            return new byte[0];
        }
    }

    private boolean hasNotifAccess() {
        return NotificationManagerCompat.getEnabledListenerPackages(this).contains(getPackageName());
    }

    /** 앱으로 돌아올 때마다 새로 감지된 결제를 대기열로 가져온다 */
    @Override
    protected void onResume() {
        super.onResume();
        // 삼성 절전 등으로 감지 서비스가 풀렸을 수 있으니 다시 붙여 달라고 한다 (이미 붙어 있으면 무시됨)
        if (hasNotifAccess()) {
            try {
                NotificationListenerService.requestRebind(new ComponentName(this, PayListener.class));
            } catch (Exception ignored) {
            }
        }
        if (web != null) web.evaluateJavascript("window.__pullPending&&window.__pullPending()", null);
    }

    private class Bridge {
        @JavascriptInterface
        public String takePending() {
            return PendingStore.takeAll(MainActivity.this);
        }

        @JavascriptInterface
        public boolean hasNotifAccess() {
            return MainActivity.this.hasNotifAccess();
        }

        /** 빌드 때 .env 에서 박아 넣은 AI 키. 없으면 빈 문자열이고, 화면 쪽은 설정에서 입력한 키를 우선한다. */
        @JavascriptInterface
        public String builtinAiKey() {
            return BuildConfig.AI_KEY;
        }

        /** 권한은 켜져 있어도 서비스가 끊겨 있을 수 있다 — 설정 화면에서 '끊김'으로 보여 준다 */
        @JavascriptInterface
        public boolean notifConnected() {
            return PayListener.isConnected();
        }

        @JavascriptInterface
        public void openNotifAccess() {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
                } catch (Exception ignored) {
                }
            });
        }

        /** 배터리 최적화 목록(권한 없이 열 수 있는 화면). 삼성 폰에서 감지가 끊길 때 안내용. */
        @JavascriptInterface
        public void openBatterySettings() {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                } catch (Exception ignored) {
                }
            });
        }

        /** 상태 바·내비 바 아이콘 색을 화면 모드에 맞춘다 */
        @JavascriptInterface
        public void setBars(final boolean dark) {
            runOnUiThread(() -> {
                WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
                c.setAppearanceLightStatusBars(!dark);
                c.setAppearanceLightNavigationBars(!dark);
                root.setBackgroundColor(dark ? 0xFF000000 : 0xFFF2F2F7);
            });
        }

        /** 전체 기록 미러. 안드로이드 자동 백업·기기 이전이 files/ 를 옮겨 주므로 새 폰에서 되살릴 수 있다. */
        @JavascriptInterface
        public void mirror(String json) {
            if (json == null) return;
            try {
                File tmp = new File(getFilesDir(), "mirror.tmp");
                try (FileOutputStream out = new FileOutputStream(tmp)) {
                    out.write(json.getBytes(StandardCharsets.UTF_8));
                }
                if (!tmp.renameTo(mirrorFile)) tmp.delete();
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public String readMirror() {
            if (!mirrorFile.exists()) return "";
            return new String(readFile(mirrorFile), StandardCharsets.UTF_8);
        }

        /** 백업 파일 내보내기 — 시스템 저장 창을 띄우고, 결과는 window.__savedFile(ok) 로 알린다 */
        @JavascriptInterface
        public void saveFile(final String name, final String content) {
            if (content == null) return;
            runOnUiThread(() -> {
                pendingSave = content;
                try {
                    createDoc.launch(name == null || name.isEmpty() ? "backup.json" : name);
                } catch (Exception e) {
                    pendingSave = null;
                    web.evaluateJavascript("window.__savedFile&&window.__savedFile(false)", null);
                }
            });
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
