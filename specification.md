# 階層別屋内地理空間情報データ仕様書

## 概要
本ドキュメントは、「階層別屋内地理空間情報データ仕様書(案)」に基づき、GeoJSON等の地理空間データとして読み解くための仕様を定義するものである。

---

## 1. 基本ルールとデータ構造

### 座標系 (Coordinate System)
* [cite_start]**CRS**: JGD2011 / (B,L) - 世界測地系 緯度経度 [cite: 121]
* [cite_start]**標高**: 属性値（`ordinal`等）として管理する。本仕様は主に2次元投影面を積層する構造をとる [cite: 87]。

### ディレクトリ・ファイル命名規則
ファイル名からメタデータを抽出するための規則。
[cite_start]基本パターン: `[施設名]_[階層名]_[データ名称].shp` [cite: 52]

* **施設名**: 任意のアルファベット（例: `JRTokyoSt`）
* **階層名**: 施設管理者の定義（例: `1`, `B1`, `M2`）。※施設データ、建物躯体データには付与されない。
* **データ名称**: 固定の英単語（後述のレイヤ定義参照）。

---

## 2. レイヤ定義とスキーマ (GeoJSON Mapping)

各シェープファイルはGeoJSONのFeatureCollectionに対応する。
[cite_start]共通項目として、すべての地物に `id` (UUID/ucode), `floor_id` (階層ID), `source` (原典区分) が定義されている [cite: 61, 236, 242]。

### A. 地物データ (Feature Data)

| データ名称 | ファイル識別子 | GeoJSON Geometry | 説明 | 備考 |
| :--- | :--- | :--- | :--- | :--- |
| **施設** | `Site` | Polygon | [cite_start]敷地全体 [cite: 151] | `floor_id`なし |
| **建物躯体** | `Building` | Polygon | [cite_start]建物の外形 [cite: 151] | `floor_id`なし |
| **階層** | `Floor` | Polygon | [cite_start]各フロアの範囲 [cite: 151] | `ordinal` (階層数値)を持つ重要レイヤ |
| **物理的な空間** | `Space` | Polygon | [cite_start]部屋、廊下、階段室 [cite: 151] | `category` (Bコード)で用途を識別 |
| **固定設置物** | `Fixture` | Polygon | [cite_start]柱、棚、障害物 [cite: 151] | `category` (Cコード)で種類を識別 |
| **任意設定空間** | `Segment` | Polygon | [cite_start]論理的なエリア（ゾーン） [cite: 151] | |
| **出入口** | `Opening` | LineString | [cite_start]ドア、開口部 [cite: 153] | 空間の境界線上に存在 |
| **描画用地物** | `Drawing` | LineString | [cite_start]階段のステップ線など [cite: 153] | 装飾用データ |
| **点状ブロック** | `TWSI_Point` | Point | [cite_start]視覚障害者誘導用(点) [cite: 153] | 警告・分岐点 |
| **線状ブロック** | `TWSI_Line` | LineString | [cite_start]視覚障害者誘導用(線) [cite: 153] | 誘導線 |

### B. ネットワークデータ (Network Data)

| データ名称 | ファイル識別子 | GeoJSON Geometry | 説明 |
| :--- | :--- | :--- | :--- |
| **ノード** | `node` | Point | [cite_start]リンクの結節点 [cite: 157] |
| **リンク** | `link` | LineString | [cite_start]経路の実体 [cite: 157] |

### C. POIデータ (Points of Interest)

| データ名称 | ファイル識別子 | GeoJSON Geometry | 説明 |
| :--- | :--- | :--- | :--- |
| **設備POI** | `Facility` | Point | [cite_start]トイレ、ATM、AEDなど [cite: 160] |
| **占有者POI** | `Occupant` | Point | [cite_start]テナント（店舗・企業） [cite: 160] |

### D. アンカーデータ (Connection Data)

| データ名称 | ファイル識別子 | GeoJSON Geometry | 説明 |
| :--- | :--- | :--- | :--- |
| **建物間接続点** | `Build_Connect` | Point | [cite_start]建物同士の接続点 [cite: 163] |
| **階層間接続点** | `Floor_Connect` | Point | [cite_start]階段・EV等の上下接続 [cite: 163] |

---

## 3. 詳細プロパティ仕様 (Key Attributes)

GeoJSONの `properties` に格納される重要な属性キー。

### 共通属性
* [cite_start]**`id`**: (String) UUIDまたはucode。ユニークキー [cite: 61]。
* [cite_start]**`floor_id`**: (String) 所属する階層（Floorレイヤ）のIDへの外部キー [cite: 242]。
* [cite_start]**`source`**: (String) データ原典 [cite: 219]。
    * `1`: フロアマップ, `2`: CAD, `3`: BIM, `4`: 3次元地図, `9`: その他

### [cite_start]階層 (Floor) 固有属性 [cite: 236]
* [cite_start]**`ordinal`**: (Float) **最重要**。論理的な階層順序 [cite: 102]。
    * `0.0`: 地上(屋外), `1.0`: 1F, `2.0`: 2F, `-1.0`: B1F
    * 中2階等は `1.5` などの小数値を取り得る。
* **`category`**: (String) 屋内/屋外区分。 `1`: indoor, `2`: outdoor

### [cite_start]物理的な空間 (Space) 固有属性 [cite: 242]
* **`category`**: (String) 空間用途コード（別表B参照）。
* **`restricted`**: (String) 進入制限。 `1`: 制限あり（業務用等）, `2`: なし
* **`toll`**: (String) 有料エリア区分。 `1`: 不明, `2`: 有料, `3`: 無料
* **`nonpublic`**: (String) 公開可否。 `1`: 公開不可, `2`: 公開可

### [cite_start]リンク (link) 固有属性 [cite: 309, 311, 313]
* **`route_type`**: (String) 経路種別。屋内地図では原則 `7` (施設内通路) が多い。
* **`direction`**: (String) 通行方向。 `1`: 双方向, `2`: 正方向(Start->End), `3`: 逆方向(End->Start)
* **`vtcl_slope`**: (String) 縦断勾配。 `1`: 5%以下, `2`: 上り(>5%), `3`: 下り(>5%)
* **`elevator`**: (String) EV属性。 `1`: なし, `2`: バリアフリー非対応, `3`: 車椅子対応, `4`: 視覚障害者対応
* **`brail_tile`**: (String) 点字ブロック有無。 `1`: なし, `2`: あり

### [cite_start]階層間接続点 (Floor_Connect) 固有属性 [cite: 348]
* **`direction_1` / `direction_2`**: (String) 接続先への移動方向。
    * `1`: 上ってゆく, `2`: 下ってゆく, `3`: 上ってくる, `4`: 下ってくる, `5`: 同一平面

---

## 4. コードリスト (Enum Values)

AI学習・解析用カテゴリコード辞書。

### [cite_start]【B】物理的な空間 (Space) カテゴリ [cite: 452, 454]
* `B001`: 商業施設 (Retail)
* `B002`: 事務所 (Office)
* `B007`-`B009`: トイレ（男/女/共用）
* `B011`-`B014`: 多機能トイレ（詳細区分あり）
* `B021`: 階段の範囲
* `B022`: エレベーターの範囲
* `B023`: エスカレーターの範囲
* `B029`: 通路/コンコース
* `B999`: 屋外

### [cite_start]【C】固定設置物 (Fixture) カテゴリ [cite: 457, 459]
* `C001`: 柱
* `C002`: ベンチ
* `C005`: ゴミ箱
* `C013`: 自動販売機
* `C014`: ATM
* `C101`: ホームドア
* `C104`: 自動改札機

### [cite_start]【F】設備POI (Facility) カテゴリ [cite: 461, 463]
* `F001`-`F008`: トイレ各所（代表点）
* `F011`-`F015`: 垂直移動設備（階段、EV、ES等の代表点）
* `F017`: 施設出入口
* `F027`: AED
* `F045`: 公衆無線LAN

---

## 5. データ結合・リレーションシップ

[cite_start]データの階層構造と結合ロジック [cite: 170, 175]。

1.  **階層所属 (Z軸の解決)**
    * **Join**: `*.floor_id` == `Floor.id`
    * 全地物は `floor_id` を介して `Floor` レイヤの `ordinal` (階層数) 属性を継承し、垂直位置を特定する。

2.  **ネットワークトポロジー (Network Graph)**
    * **Join**: `Link.start_id` == `Node.id` AND `Link.end_id` == `Node.id`
    * 平面的な移動グラフを構築する。

3.  **垂直・建物間接続 (Vertical/Inter-building Connection)**
    * **Logic**:
        `Link` <-> `Node` <-> `Floor_Connect` (現在階) <-> `Floor_Connect` (接続先階) <-> `Node` <-> `Link`
    * `Floor_Connect` 同士は `anch_id` 属性で相互参照される。

---

## 6. AI処理時の留意事項

1.  **座標精度**: 屋内測位を想定し、小数点以下7桁以上の精度（cm級）での扱いが望ましい。
2.  [cite_start]**階層順序**: `Floor.name`（表示名）ではなく必ず `ordinal`（数値）でソート・計算を行うこと [cite: 102]。
3.  [cite_start]**言語**: 属性値（名称等）は日本語が主となる。多言語対応は別途CSV（`MultiLanguage.csv`）との結合が必要 [cite: 430]。