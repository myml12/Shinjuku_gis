"""
3D構内図可視化ツール - 全情報表示版
施設ごとの属性情報を3D空間内にテキストで表示
"""

import geopandas as gpd
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
import glob

# macOS用フォント設定
plt.rcParams['font.family'] = 'Hiragino Sans'

# 階層名とfloor値のマッピング
floor_mapping = {
    '1': 1.0,
    'B1': -1.0,
    'B2': -2.0,
    'B3': -3.0,
    'B5': -5.0,
    'B6': -6.0
}

# カテゴリコードのラベル定義
FACILITY_CATEGORY_LABELS = {
    'F011': '階段',
    'F012': 'エレベーター',
    'F013': 'エスカレーター',
    'F014': '階段（その他）',
    'F015': '階段（その他）',
    'F017': '施設出入口',
    'F027': 'AED',
    'default': 'その他設備'
}

SPACE_CATEGORY_LABELS = {
    'B001': '商業施設',
    'B002': '事務所',
    'B007': 'トイレ（男）',
    'B008': 'トイレ（女）',
    'B009': 'トイレ（共用）',
    'B011': '多機能トイレ',
    'B021': '階段',
    'B022': 'エレベーター',
    'B023': 'エスカレーター',
    'B029': '通路/コンコース',
    'B999': '屋外',
    'default': 'その他空間'
}

ROUTE_TYPE_LABELS = {
    '1': '一般通路',
    '4': 'エレベーター',
    '5': '階段',
    '6': 'エスカレーター',
    '7': '施設内通路'
}

DIRECTION_LABELS = {
    '1': '双方向',
    '2': '正方向',
    '3': '逆方向'
}

ELEVATOR_LABELS = {
    '1': 'なし',
    '2': 'バリアフリー非対応',
    '3': '車椅子対応',
    '4': '視覚障害者対応'
}


def get_floor_from_filename(filename):
    """ファイル名から階層を取得"""
    for key, floor_val in floor_mapping.items():
        if key in filename:
            return key, floor_val
    return None, None


def get_facility_label(category):
    """Facilityカテゴリに応じたラベルを取得"""
    if category and category in FACILITY_CATEGORY_LABELS:
        return FACILITY_CATEGORY_LABELS[category]
    return FACILITY_CATEGORY_LABELS['default']


def get_space_label(category):
    """Spaceカテゴリに応じたラベルを取得"""
    if category and category in SPACE_CATEGORY_LABELS:
        return SPACE_CATEGORY_LABELS[category]
    return SPACE_CATEGORY_LABELS['default']


def format_facility_info(row):
    """Facilityの情報をフォーマット（簡易版）"""
    category = row.get('category', '')
    if category:
        return get_facility_label(category)
    return ''


def format_space_info(row):
    """Spaceの情報をフォーマット"""
    info_lines = []

    # カテゴリ
    category = row.get('category', '')
    if category:
        info_lines.append(f"カテゴリ: {get_space_label(category)} ({category})")

    # ID
    obj_id = row.get('id', '')
    if obj_id:
        info_lines.append(f"ID: {obj_id[:8]}...")

    # 名称
    name = row.get('name', '').strip()
    if name and name != ' ':
        info_lines.append(f"名称: {name}")

    # 進入制限
    restricted = row.get('restricted', '')
    if restricted:
        restricted_map = {'1': '制限あり', '2': '制限なし'}
        info_lines.append(
            f"進入制限: {restricted_map.get(restricted, restricted)}")

    # 有料エリア
    toll = row.get('toll', '')
    if toll:
        toll_map = {'1': '不明', '2': '有料', '3': '無料'}
        info_lines.append(f"有料: {toll_map.get(toll, toll)}")

    # 公開可否
    nonpublic = row.get('nonpublic', '')
    if nonpublic:
        nonpublic_map = {'1': '公開不可', '2': '公開可'}
        info_lines.append(f"公開: {nonpublic_map.get(nonpublic, nonpublic)}")

    # 原典
    source = row.get('source', '')
    if source:
        source_map = {'1': 'フロアマップ', '2': 'CAD',
                      '3': 'BIM', '4': '3次元地図', '9': 'その他'}
        info_lines.append(f"原典: {source_map.get(source, source)}")

    return '\n'.join(info_lines)


def format_link_info(row):
    """Linkの情報をフォーマット"""
    info_lines = []

    # 経路タイプ
    route_type = str(row.get('route_type', '7'))
    if route_type in ROUTE_TYPE_LABELS:
        info_lines.append(
            f"経路: {ROUTE_TYPE_LABELS[route_type]} ({route_type})")

    # 方向
    direction = str(row.get('direction', '1'))
    if direction in DIRECTION_LABELS:
        info_lines.append(f"方向: {DIRECTION_LABELS[direction]}")

    # 距離
    distance = row.get('distance', '')
    if distance:
        info_lines.append(f"距離: {distance:.1f}m")

    # エレベーター
    elevator = str(row.get('elevator', '1'))
    if elevator in ELEVATOR_LABELS:
        info_lines.append(f"EV: {ELEVATOR_LABELS[elevator]}")

    # 点字ブロック
    brail_tile = str(row.get('brail_tile', '1'))
    if brail_tile:
        brail_map = {'1': 'なし', '2': 'あり'}
        info_lines.append(f"点字: {brail_map.get(brail_tile, brail_tile)}")

    # 縦断勾配
    vtcl_slope = str(row.get('vtcl_slope', '1'))
    if vtcl_slope:
        slope_map = {'1': '5%以下', '2': '上り(>5%)', '3': '下り(>5%)'}
        info_lines.append(f"勾配: {slope_map.get(vtcl_slope, vtcl_slope)}")

    return '\n'.join(info_lines)


def plot_polygon_3d(ax, polygon, z, color, alpha=0.3, fill=True):
    """3D空間にポリゴンを描画（面と境界線）"""
    if polygon.geom_type == 'Polygon':
        coords = list(polygon.exterior.coords)
        xs = [c[0] for c in coords]
        ys = [c[1] for c in coords]
        zs = [z] * len(coords)

        # 面を描画
        if fill and len(coords) >= 3:
            # ポリゴンの頂点を3D座標に変換
            vertices = [[xs[i], ys[i], zs[i]] for i in range(len(coords))]
            # Poly3DCollectionで面を描画
            poly3d = Poly3DCollection([vertices], alpha=alpha, facecolor=color,
                                      edgecolor=color, linewidths=0.3)
            ax.add_collection3d(poly3d)

        # 境界線を描画
        xs.append(xs[0])
        ys.append(ys[0])
        zs.append(zs[0])
        ax.plot(xs, ys, zs, color=color, linewidth=0.5,
                alpha=min(alpha + 0.2, 1.0))


# GeoJSON読み込み
nodes_gdf = gpd.read_file("node.geojson")
links_gdf = gpd.read_file("link.geojson")

# ノードIDと座標+floorを辞書化
node_coords = {nid: (row.geometry.x, row.geometry.y, row.floor)
               for nid, row in nodes_gdf.set_index('node_id').iterrows()}

# 3Dプロット
fig = plt.figure(figsize=(20, 14))
ax = fig.add_subplot(111, projection='3d')

# 全てのGeoJSONファイルを読み込み
geojson_files = glob.glob("*.geojson")
geojson_files = [f for f in geojson_files if f not in [
    'node.geojson', 'link.geojson']]

print(f"読み込むGeoJSONファイル数: {len(geojson_files)}")

# ノードを散布図（軽量化）
x = nodes_gdf.geometry.x
y = nodes_gdf.geometry.y
z = nodes_gdf["floor"]
ax.scatter(x, y, z, c=z, cmap='coolwarm', s=10, depthshade=False,
           alpha=0.5, edgecolors='none', label='ノード')

# リンクを描画
link_count = 0
for idx, row in links_gdf.iterrows():
    if "start_id" in row and "end_id" in row:
        n1 = row["start_id"]
        n2 = row["end_id"]
        if n1 in node_coords and n2 in node_coords:
            xs = [node_coords[n1][0], node_coords[n2][0]]
            ys = [node_coords[n1][1], node_coords[n2][1]]
            zs = [node_coords[n1][2], node_coords[n2][2]]

            # 経路タイプに応じた色
            route_type = str(row.get('route_type', '7'))
            if route_type == '5':
                link_color = '#FFD93D'  # 階段
            elif route_type == '4':
                link_color = '#6BCB77'  # エレベーター
            elif route_type == '6':
                link_color = '#4D96FF'  # エスカレーター
            else:
                link_color = 'lightblue'  # 一般通路

            ax.plot(xs, ys, zs, color=link_color, linewidth=0.8, alpha=0.3)

            # リンクの情報表示は非表示（軽量化のため）
            link_count += 1

# 各階層のGeoJSONファイルを処理
for geojson_file in sorted(geojson_files):
    try:
        gdf = gpd.read_file(geojson_file)
        floor_key, floor = get_floor_from_filename(geojson_file)

        if floor_key is None:
            continue

        print(f"処理中: {geojson_file} (階層: {floor_key}, Floor: {floor})")

        # Floorレイヤ（床面を描画）
        if 'Floor' in geojson_file:
            for idx, row in gdf.iterrows():
                geom = row.geometry
                if geom.geom_type == 'Polygon':
                    plot_polygon_3d(ax, geom, floor,
                                    'lightgray', 0.4, fill=True)
                elif geom.geom_type == 'MultiPolygon':
                    for poly in geom.geoms:
                        plot_polygon_3d(ax, poly, floor,
                                        'lightgray', 0.4, fill=True)

        # Spaceレイヤ
        elif 'Space' in geojson_file:
            for idx, row in gdf.iterrows():
                geom = row.geometry
                category = row.get('category', '')

                # 色分け
                if category == 'B001':
                    color = '#FF6B6B'  # 商業施設
                elif category == 'B002':
                    color = '#4ECDC4'  # 事務所
                elif category == 'B021':
                    color = '#FFD93D'  # 階段
                elif category == 'B022':
                    color = '#6BCB77'  # エレベーター
                elif category == 'B029':
                    color = '#E8E8E8'  # 通路
                else:
                    color = '#D3D3D3'  # デフォルト

                if geom.geom_type == 'Polygon':
                    plot_polygon_3d(ax, geom, floor, color, 0.3, fill=True)

                    # 重要なカテゴリのみ情報を表示（軽量化）
                    if category in ['B021', 'B022', 'B023']:  # 階段、エレベーター、エスカレーターのみ
                        centroid = geom.centroid
                        space_label = get_space_label(category)
                        ax.text(centroid.x, centroid.y, floor + 0.05, space_label,
                                fontsize=8, bbox=dict(boxstyle='round,pad=0.3',
                                                      facecolor='lightblue', alpha=0.7))

                elif geom.geom_type == 'MultiPolygon':
                    for poly in geom.geoms:
                        plot_polygon_3d(ax, poly, floor, color, 0.3, fill=True)
                        # 情報表示は最初のポリゴンのみ
                        if category in ['B021', 'B022', 'B023']:
                            centroid = poly.centroid
                            space_label = get_space_label(category)
                            ax.text(centroid.x, centroid.y, floor + 0.05, space_label,
                                    fontsize=8, bbox=dict(boxstyle='round,pad=0.3',
                                                          facecolor='lightblue', alpha=0.7))
                            break  # 最初の1つだけ表示

        # Facilityレイヤ
        elif 'Facility' in geojson_file:
            for idx, row in gdf.iterrows():
                geom = row.geometry
                if geom.geom_type == 'Point':
                    category = row.get('category', '')

                    # カテゴリに応じた色
                    if category == 'F011':
                        color = '#FF6B6B'  # 階段
                        marker = 's'
                    elif category == 'F012':
                        color = '#4ECDC4'  # エレベーター
                        marker = 's'
                    elif category == 'F013':
                        color = '#95E1D3'  # エスカレーター
                        marker = 's'
                    elif category == 'F027':
                        color = '#FF0000'  # AED
                        marker = 'D'
                    else:
                        color = '#FFA500'  # その他
                        marker = '^'

                    ax.scatter(geom.x, geom.y, floor, c=color, s=80,
                               alpha=0.7, depthshade=False, marker=marker,
                               edgecolors='darkred', linewidths=0.5)

                    # 重要な設備のみ情報を表示（軽量化）
                    category = row.get('category', '')
                    if category in ['F011', 'F012', 'F013', 'F027']:  # 階段、EV、ES、AEDのみ
                        facility_info = format_facility_info(row)
                        if facility_info:
                            ax.text(geom.x, geom.y, floor + 0.2, facility_info,
                                    fontsize=7, bbox=dict(boxstyle='round,pad=0.3',
                                                          facecolor='lightcoral', alpha=0.8, edgecolor='red', linewidth=0.5))

    except Exception as e:
        print(f"✗ {geojson_file} の読み込みエラー: {e}")

# 軸の設定
ax.set_xlabel('経度 (Longitude)', fontsize=12)
ax.set_ylabel('緯度 (Latitude)', fontsize=12)
ax.set_zlabel('階層 (Floor)', fontsize=12)
ax.set_title('3D構内図 - 全情報表示版\n（施設ごとの属性情報を3D空間内に表示）',
             fontsize=16, fontweight='bold', pad=20)

# 凡例
legend_elements = [
    plt.Line2D([0], [0], marker='o', color='w', markerfacecolor='blue',
               markersize=10, label='ノード'),
    plt.Line2D([0], [0], color='lightblue', linewidth=2, label='一般通路'),
    plt.Line2D([0], [0], color='#FFD93D', linewidth=2, label='階段'),
    plt.Line2D([0], [0], color='#6BCB77', linewidth=2, label='エレベーター'),
    plt.Line2D([0], [0], marker='s', color='w', markerfacecolor='#FF6B6B',
               markersize=10, label='設備（階段）'),
    plt.Line2D([0], [0], marker='D', color='w', markerfacecolor='#FF0000',
               markersize=10, label='AED'),
]

ax.legend(handles=legend_elements, loc='upper left', fontsize=9)

plt.tight_layout()
plt.show()
