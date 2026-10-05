# Lotereya

Azərbaycanda ailələr və yaxınlar arasında oynanan "lotereya"nın onlayn versiyası.

**Məntiq.** 5 nəfər bir araya gəlir. Hər ay biri pulu götürür, qalan 4 nəfər ona eyni məbləği verir. Oyun 5 ay davam edir. Sonda heç kim pul itirmir: hər kəs bir ay böyük məbləği alır, qalan 4 ayda isə payını verir.

| | 1-ci ay | 2-ci ay | 3-cü ay | 4-cü ay | 5-ci ay | Cəmi |
|---|---|---|---|---|---|---|
| Aysel | **+400** | −100 | −100 | −100 | −100 | 0 |
| Rəşad | −100 | **+400** | −100 | −100 | −100 | 0 |
| … | | | | | | 0 |

## Nə edir

- **SİMA ilə hesab.** Qeydiyyat və giriş yalnız SİMA imzası ilədir. FİN və ad-soyad sertifikatdan götürülür, ona görə bir adam iki hesab aça bilmir. Bazada FİN-in özü yox, HMAC heşi və maskalanmış forması (`5A***2D`) saxlanılır.
- **Otaqlar.** Hər otağın adı, iştirakçı sayı (3–12), dövr başına məbləği, dövrü (aylıq və ya həftəlik) və növbə qaydası var. Növbə ya püşkatma ilə (təsadüfi), ya da reytinqə görə müəyyən olunur (ən etibarlı birinci alır). Otaq açıq ola bilər, ya da gizli: gizli otağa yalnız 6 simvollu dəvət kodu ilə qoşulmaq olur, ailələr üçün nəzərdə tutulub. Otaq dolanda oyun avtomatik başlayır.
- **Ödənişlər.** Hər dövrdə ödəyən "Göndərdim" basır (istəsə qəbz nömrəsini yazır), pulu alan isə "Aldım" ilə təsdiqləyir. Bütün ödənişlər təsdiqlənəndə növbəti dövr başlayır. Son tarixlər başlanğıcdan sabit təqvimlə hesablanır.
- **Şəxsi kabinet.** Burada reytinq, səviyyə, növbəti səviyyəyə nə qədər qaldığı, statistika, ödəməli olduqlarınız, təsdiqləməli olduqlarınız, otaqlarınız və reytinq tarixçəsi görünür.
- **Reytinq və səviyyələr.** Uğurlu oyunlar reytinqi qaldırır, reytinq də daha böyük məbləğli otaqları açır.

### Reytinq qaydaları

| Hadisə | Bal |
|---|---|
| Vaxtında ödəniş (alan təsdiqləyəndə) | +5 |
| Oyun uğurla başa çatdı (ödənilməmiş borcu olmayanlar) | +20 |
| Son tarix keçdi, ödəniş hələ "Göndərdim" deyil | −15 |
| Son tarixdən 15 gün sonra hələ ödənilməyib | −40 |

Reytinqi mənfi olan istifadəçi yeni otağa qoşula bilmir.

### Səviyyələr

| Səviyyə | Reytinq | Dövr başına maks. məbləğ | Eyni anda otaq |
|---|---|---|---|
| Bürünc | 0+ | 200 ₼ | 1 |
| Gümüş | 40+ | 500 ₼ | 2 |
| Qızıl | 150+ | 1 500 ₼ | 3 |
| Platin | 400+ | 5 000 ₼ | 5 |

5 nəfərlik bir təmiz oyun 4×5 + 20 = 40 bal verir və istifadəçini Gümüş səviyyəsinə qaldırır. Rəqəmlər `src/game.js` faylında, `TIERS` və `RATING` sabitlərindədir.

**Niyə belədir?** Bu oyunda ən böyük risk budur: kimsə növbəsi tez çatanda pulu alır, sonra ödəməyi dayandırır. Bunun qarşısını üç şey alır: SİMA ilə real şəxsiyyət, kiçik məbləğlərdən başlamaq məcburiyyəti və eyni anda otaq limiti. Çox otağa birdən girib hamısında ilk növbəni almaq mümkün olmur.

## İşə salmaq

Yalnız Node.js 18+ lazımdır, heç bir asılılıq yoxdur.

```bash
cd lotereya
npm run demo     # http://localhost:3100, SİMA simulyasiya olunur, botlar var
npm test
```

**Demo rejimində** "SİMA ilə daxil ol" basın, sonra "Demo SİMA telefonu" pəncərəsində istənilən FİN (7 simvol) və ad yazıb imzalayın. Otaq yaradın, "Demo: botlarla doldur" ilə otağı doldurun, sonra "Demo: botlar ödəsin" ilə bütün oyunu təkbaşına oynayın.

| Dəyişən | Standart | Mənası |
|---|---|---|
| `PORT` | `3100` | HTTP portu |
| `DEMO` | — | `1` olanda SİMA simulyasiyası və botlar aktivdir |
| `FIN_SECRET` | demoda sabit | FİN heşi üçün gizli açar (production-da **mütləq**) |
| `DB_FILE` | `data/db.json` | Məlumat faylı |
| `SIMA_API_URL`, `SIMA_CLIENT_ID`, `SIMA_CLIENT_SECRET` | — | Real SİMA inteqrasiyası |

## SİMA inteqrasiyası

Giriş axını belə işləyir:

1. Sayt `POST /api/auth/sima/start` çağırır və server imza sorğusu yaradır (təsadüfi challenge ilə).
2. İstifadəçi telefonda SİMA tətbiqini açır (deeplink/QR) və sorğunu imzalayır.
3. Sayt hər 2 saniyədən bir `POST /api/auth/sima/status/:id` ilə vəziyyəti soruşur. İmza gələndə server onu və sertifikatı yoxlayır, FİN və adı götürür, hesabı tapır və ya yaradır, sessiya açır.

`src/sima.js` faylında iki provayder var:

- `MockSimaProvider`: demo üçündür. İmzanı HMAC ilə simulyasiya edir və hər imza yalnız bir dəfə istifadə oluna bilir.
- `SimaProvider`: real SİMA üçün boş şablondur. SİMA İmza-nın inteqrasiya API-si və açarları xidmət müqaviləsi ilə verilir. Onları aldıqdan sonra `createRequest` və `getResult` metodlarını sənədləşməyə uyğun doldurmaq lazımdır. Tətbiqin qalan hissəsi dəyişmir.

## Real istifadədən əvvəl

Bu kod işlək prototipdir (MVP). İnsanların real pulu ilə işə salmazdan əvvəl bunlar lazımdır:

- **Pul tətbiqdən keçmir.** İştirakçılar bir-birinə birbaşa köçürür (kart, bank), tətbiq isə yalnız qeyd aparır və təsdiq alır. Əgər pulu tətbiq özü yığıb paylasa (escrow), bu, ödəniş xidməti sayılır və Mərkəzi Bankın lisenziyası və ya lisenziyalı bankla tərəfdaşlıq tələb edir. Hüquqşünasla məsləhətləşin.
- **Öhdəlik sənədi.** Otaq başlayanda hər iştirakçı qaydaları və ödəniş cədvəlini SİMA ilə imzalaya bilər. Belə sənədin hüquqi qüvvəsi olur.
- **Mübahisələr.** Ödəyən "göndərdim" deyir, alan isə "almadım" deyə bilər. Hazırda belə ödənişə cərimə tətbiq olunmur. Admin paneli və mübahisə prosesi lazımdır.
- **Texniki.** JSON faylı PostgreSQL ilə əvəz edilməlidir. Son tarix yaxınlaşanda SMS və ya push xatırlatmaları, HTTPS, sorğu limitləri və loglar lazımdır.
- **Mobil tətbiq.** API brauzerdən asılı deyil, ona görə React Native və ya Flutter tətbiqi eyni serverlə işləyə bilər.

## API

| Endpoint | Nə edir |
|---|---|
| `GET /api/config` | Səviyyələr, reytinq qaydaları, limitlər |
| `POST /api/auth/sima/start` | SİMA imza sorğusu |
| `POST /api/auth/sima/status/:id` | Sorğunun vəziyyəti; imzalananda sessiya açır |
| `POST /api/auth/logout` | Çıxış |
| `GET /api/me` | Şəxsi kabinet |
| `GET /api/rooms` | Açıq otaqlar və sizin üçün qoşulma imkanı |
| `POST /api/rooms` | Otaq yarat: `{ name, memberCount, amount, periodDays, order, isPrivate }` |
| `POST /api/rooms/join` | Kodla qoşul: `{ code }` |
| `GET /api/rooms/:id` | Otaq, növbə, dövrlər, ödənişlər |
| `POST /api/rooms/:id/join` / `leave` | Açıq otağa qoşul / başlamamış otaqdan çıx |
| `POST /api/rooms/:id/payments/:pid/sent` | "Göndərdim": `{ reference }` |
| `POST /api/rooms/:id/payments/:pid/confirm` | "Aldım" |

## Struktur

```
server.js        HTTP server, API, sessiyalar, gecikmə yoxlaması (dəqiqədə bir)
src/game.js      Oyun qaydaları: otaq, növbə, ödəniş, reytinq, səviyyə
src/sima.js      SİMA provayderləri (demo və real şablon)
src/store.js     JSON fayl bazası
src/demo.js      Demo botları
public/          Veb interfeys (Azərbaycan dilində)
test/            node:test testləri
```
