<p align="center">
  <img src="docs/images/banner.svg" alt="Octetlab — tarayıcında ağ laboratuvarı" width="100%">
</p>

<p align="center">
  <a href="https://octetlab.slovveis.workers.dev"><img alt="Canlı demo" src="https://img.shields.io/badge/canl%C4%B1_demo-octetlab.slovveis.workers.dev-0369a1?style=for-the-badge&logo=cloudflare&logoColor=white"></a>
</p>
<p align="center">
  <a href="https://github.com/system-conf/Octetlab/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/system-conf/Octetlab/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-16a34a"></a>
  <img alt="English | Türkçe" src="https://img.shields.io/badge/i18n-English%20%7C%20T%C3%BCrk%C3%A7e-7c3aed">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white">
  <img alt="Tests" src="https://img.shields.io/badge/tests-2000%2B-0f766e">
  <a href="#chatgpt-veya-claude-ile-kullan-mcp"><img alt="ChatGPT ve Claude için MCP sunucusu" src="https://img.shields.io/badge/MCP-ChatGPT%20%7C%20Claude-0369a1"></a>
</p>

<p align="center">
  <a href="README.md">English</a> · <b>Türkçe</b>
</p>

Octetlab, tamamen tarayıcıda çalışan açık kaynaklı bir ağ laboratuvarı. Ağını kurarsın, kablolarını
takarsın, ayarlarını arayüzden ya da IOS tarzı komut satırından yaparsın ve simülasyon modunda her
paketin nereye gittiğini adım adım izlersin. Kurulum ve üyelik gerekmez; bilgisayarda ve tablette
çalışır. **Türkçe** ve **İngilizce**, yeni dillere hazır.

<p align="center">
  <img src="docs/images/simulation.gif" alt="Simülasyon modunda bir ping: ARP ve ICMP paketleri PC1'den switch üzerinden router'a gidiyor, altta olay listesi" width="760">
</p>

## Ekran görüntüleri

<p align="center">
  <img src="docs/images/landingTr.png" alt="Türkçe ana sayfa" width="80%"><br>
  <sub>Türkçe arayüz — diğer görüntüler İngilizce arayüzden</sub>
</p>

<table>
  <tr>
    <td width="50%"><img src="docs/images/sampleLesson.png" alt="Ders paneliyle bir örnek lab"><br><sub><b>Örnek lablar</b> — çalışan bir ağ, kısa bir ders ve kendini kontrol eden adımlar</sub></td>
    <td width="50%"><img src="docs/images/simulation.png" alt="Olay listesi ve PDU incelemesiyle simülasyon modu"><br><sub><b>Simülasyon modu</b> — her paketi adım adım izle, katman katman içine bak</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/deviceCli.png" alt="Router'da IOS tarzı CLI"><br><sub><b>Cihaz CLI'ı</b> — kısaltmalar, ? yardımı, Tab tamamlama ve sayfalama</sub></td>
    <td width="50%"><img src="docs/images/darkMode.png" alt="Koyu temada çalışma alanı"><br><sub><b>Koyu tema</b> — açık, koyu ya da sistemle aynı</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/samples.png" alt="Örnek lab kütüphanesi"><br><sub><b>Örnek lab kütüphanesi</b> — adreslemeden VLAN'lar arası routing'e 24 ders</sub></td>
    <td width="50%"><img src="docs/images/designTasks.png" alt="Tasarım görevleri"><br><sub><b>Tasarım görevleri</b> — müşteri talebi, bütçe ve canlı kontrol listesi</sub></td>
  </tr>
</table>

## Neler yapabilirsin

- **Ağ kur:** Router, switch (L2 / L3, PoE), hub, erişim noktası, kablosuz router, modem, sunucu,
  PC, dizüstü, telefon, yazıcı, kamera, NVR ve daha fazlasını (37 cihaz modeli) haritaya sürükle,
  doğru kabloyla bağla, port ışıklarının yandığını gör.
- **Yapılandır:** Port, VLAN, trunk, SVI, router-on-a-stick, statik ve yedek (floating) rota,
  DHCP (havuz, hariç tutma, relay), DNS, Wi-Fi SSID'leri. Ayar panelinden ya da **cihaz CLI'ından**
  (`enable`, `conf t`, `interface`, `switchport`, `ip address`, `show vlan brief`,
  `show ip route`, `show running-config`, `?` yardımı, Tab tamamlama, `--More--` sayfalama).
- **Test et:** Uç cihazlarda Windows tarzı terminal (`ping`, `ipconfig`, `nslookup`, `tracert`,
  `arp -a`).
- **Simülasyon modu:** Belirlenimci, paket düzeyinde simülatör. ARP, DHCP, DNS, ICMP ve VLAN
  etiketlemeyi olay olay izle, her paketi katman katman incele, protokole göre filtrele ve kaydı
  Wireshark için `.pcap` olarak dışa aktar.
- **Örnek lablar:** 24 kısa ders (temeller, DHCP, DNS, switching, routing, paket görünümü). Her biri
  hazır bir lab, otomatik kontrol edilen "bunu dene" adımları ve "boz bakalım" fikirleriyle gelir.
- **Arıza alıştırmaları:** Küçük işletme ağlarında (restoran, ofis, mağaza) gerçek hayattan arızalar.
  Yanlış ayarı bul, düzelt, doğrula; rapor ne olduğunu anlatır.
- **Tasarım görevleri:** Bir müşteri talebi (küçük ofis, restoran, okul, fabrika, otel), gereksinimler,
  bütçe ve canlı kontrol listesi. Teslim et, değerlendirmeni al, teslim dosyasını
  (topoloji, IP planı, VLAN tablosu, port listesi) indir.
- **Dosyaların:** Lablar tarayıcında otomatik kaydedilir; `.agl.json` olarak dışa / içe aktarılır,
  bağlantıyla paylaşılır, tüm cihazların config'leri metin olarak indirilir.
- **Tercihler:** Açık / koyu / sistem teması, harita etiketleri, ızgara ve yapıştırma, animasyon hızı,
  terminal ve CLI seçenekleri.

Octetlab bir oyun değil, öğrenme laboratuvarı: puan yok, can yok; gerçek ağlar gibi davranan ağlar
var. Yol haritası (dinamik routing, STP, ACL / NAT, IPv6, kablosuz güvenlik, WAN, sunucular ve
fazlası) [docs/PLAN_V2.md](docs/PLAN_V2.md) ve [docs/PARITY.md](docs/PARITY.md) dosyalarında.

## ChatGPT veya Claude ile kullan (MCP)

Octetlab bir MCP sunucusu olarak da çalışıyor; yani bir sohbet asistanı lab işlerini senin yerine
yapabilir, bilgisayardan da telefondan da. Ne istediğini düz cümlelerle yazarsın: asistan sıfırdan
ya da bir örnekten lab kurar, cihaz ekleyip kablolar, bilgisayarların, router'ların ve switch'lerin
ayarlarını yapar, `ping`, `tracert` ve `show` komutlarını çalıştırır, sonunda da labı Octetlab'de
açan bir bağlantı verir.

**Sunucu adresi:** `https://octetlabmcp.slovveis.workers.dev/mcp` (giriş yapmak gerekmez)

Nasıl eklenir (menü adları sürüme ve pakete göre biraz farklı olabilir):

- **ChatGPT:** Ayarlar → Uygulamalar / Bağlayıcılar → özel MCP sunucusu ekle (önce geliştirici
  modunu açman gerekebilir). Yukarıdaki adresi yapıştır, kimlik doğrulama olarak **yok**'u seç.
- **Claude:** Ayarlar → Bağlayıcılar → özel bağlayıcı ekle ve yukarıdaki adresi yapıştır.

Şunları sorabilirsin:

- "Bir router, bir switch ve üç PC'li bir lab kur, 192.168.10.0/24 kullan, sonra PC1'den PC3'e ping at."
- "VLAN'lar arası routing örneğini aç ve router'da `show ip route` çıktısını göster."
- "Router'da VLAN 20 için DHCP kur, dizüstünün adres alıp almadığına bak."
- "Paylaşım bağlantım bu: PC2 neden sunucuya ulaşamıyor?"

Sınırlar: lablar 7 gün saklanır; sunucu kişisel veri tutmaz, yalnızca labların kendisini saklar;
IP adresi başına dakikada 60 istek yapılabilir; araçların çıktısı İngilizcedir (asistan yine de
sana kendi dilinde cevap verir). Araç listesi ve tasarım: [docs/MCP_SERVER.md](docs/MCP_SERVER.md).

## Yerelde çalıştır

Node.js 22 veya üstü gerekir.

```bash
npm install
npm run dev        # geliştirme sunucusu
npm test           # birim testleri (Vitest)
npm run lint       # ESLint
npm run build      # tip kontrolü ve üretim derlemesi
npm run deploy     # derleyip Cloudflare Workers'a yayınla
```

Uçtan uca testler: `npm run test:e2e` (Playwright; ilk sefer `npx playwright install chromium`).
Ayrıntılar İngilizce [README.md](README.md) dosyasında.

## Yeni dil ekle

1. `src/locales/en/` klasörünü `src/locales/<kod>/` olarak kopyala ve tüm değerleri çevir
   (anahtarları ve `{{yer tutucuları}}` değiştirme).
2. `src/i18n/languages.ts` dosyasına bir satır ekle: `{ code, nativeName, dir }`.

Hepsi bu; `npm test` her anahtarın ve yer tutucunun İngilizceyle eşleştiğini kontrol eder.
Ayrıntılar [docs/I18N.md](docs/I18N.md) dosyasında. Cihaz çıktıları (Windows `ping`, IOS `show`
komutları…) gerçek cihazlarda olduğu gibi her dilde İngilizce kalır.

## Markalar

Cisco, IOS ve Packet Tracer, Cisco Systems, Inc.'in markalarıdır. Octetlab bağımsız bir projedir;
Cisco ile bağlantısı yoktur ve Cisco tarafından onaylanmamıştır. Komut satırı, öğrenme amacıyla
yaygın olarak öğretilen IOS sözdizimini izler; tüm ikonlar, görseller ve lab içerikleri özgündür.

## Lisans

MIT — bkz. [LICENSE](LICENSE).
