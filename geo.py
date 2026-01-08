import geopandas as gpd
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
import glob

# macOS用フォント設定（Hiragino Sans）
plt.rcParams['font.family'] = 'Hiragino Sans'
plt.rcParams['font.sans-serif'] = ['Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', 'Takao', 'IPAexGothic', 'IPAPGothic', 'VL PGothic', 'Noto Sans CJK JP']

# 階層名とfloor値のマッピング
floor_mapping = {
    '1': 1,
    'B1': -1,
    'B2': -2,
    'B3': -3,
    'B5': -5,
    'B6': -6
}


def get_floor_from_filename(filename):
    """ファイル名から階層を取得"""
    for key, floor_val in floor_mapping.items():
        if key in filename:
            return floor_val
    return 0  # デフォルト


def plot_polygon_3d(ax, polygon, z, color, alpha=0.3):
    """3D空間にポリゴンを描画（境界線のみ - 軽量版）"""
    if polygon.geom_type == 'Polygon':
        coords = list(polygon.exterior.coords)
        xs = [c[0] for c in coords]
        ys = [c[1] for c in coords]
        zs = [z] * len(coords)
        # 境界線を閉じる
        xs.append(xs[0])
        ys.append(ys[0])
        zs.append(zs[0])
        ax.plot(xs, ys, zs, color=color, linewidth=0.5, alpha=alpha)


# GeoJSON読み込み（ノードとリンク）
nodes_gdf = gpd.read_file("node.geojson")
links_gdf = gpd.read_file("link.geojson")

# ノードIDと座標+floorを辞書化
node_coords = {nid: (row.geometry.x, row.geometry.y, row.floor)
               for nid, row in nodes_gdf.set_index('node_id').iterrows()}

# 3Dプロット
fig = plt.figure(figsize=(16, 12))
ax = fig.add_subplot(111, projection='3d')

# ノードを散布図（depthshadeを無効化して高速化）
x = nodes_gdf.geometry.x
y = nodes_gdf.geometry.y
z = nodes_gdf["floor"]
scatter = ax.scatter(x, y, z, c=z, cmap='coolwarm',
                     s=20, depthshade=False, alpha=0.7,
                     marker='o', label='ノード', edgecolors='none')

# リンクをノード座標に沿って描画（バッチ処理で高速化）
link_lines = []
for idx, row in links_gdf.iterrows():
    if "start_id" in row and "end_id" in row:
        n1 = row["start_id"]
        n2 = row["end_id"]
        if n1 in node_coords and n2 in node_coords:
            xs = [node_coords[n1][0], node_coords[n2][0]]
            ys = [node_coords[n1][1], node_coords[n2][1]]
            zs = [node_coords[n1][2], node_coords[n2][2]]
            link_lines.append((xs, ys, zs))

# バッチ描画
for xs, ys, zs in link_lines:
    ax.plot(xs, ys, zs, color='lightblue', linewidth=1, alpha=0.5)

# 全てのGeoJSONファイルを自動的に読み込んで表示
geojson_files = glob.glob("*.geojson")
geojson_files = [f for f in geojson_files if f not in [
    'node.geojson', 'link.geojson']]

print(f"読み込むGeoJSONファイル数: {len(geojson_files)}")

for geojson_file in sorted(geojson_files):
    try:
        gdf = gpd.read_file(geojson_file)
        floor = get_floor_from_filename(geojson_file)

        # ファイルタイプに応じて色とスタイルを変更
        if 'Facility' in geojson_file:
            color = 'red'
            alpha = 0.6
            size = 15
        elif 'Floor' in geojson_file:
            color = 'lightgray'
            alpha = 0.7
            size = 0.8
        elif 'Space' in geojson_file:
            color = 'lightblue'
            alpha = 0.5
            size = 0.8
        else:
            color = 'gray'
            alpha = 0.5
            size = 0.8

        # ジオメトリタイプに応じて描画（バッチ処理で最適化）
        points_x, points_y, points_z = [], [], []
        lines_data = []
        polygons_data = []

        for idx, row in gdf.iterrows():
            geom = row.geometry

            if geom.geom_type == 'Point':
                points_x.append(geom.x)
                points_y.append(geom.y)
                points_z.append(floor)

            elif geom.geom_type == 'LineString':
                coords = list(geom.coords)
                xs = [c[0] for c in coords]
                ys = [c[1] for c in coords]
                zs = [floor] * len(coords)
                lines_data.append((xs, ys, zs))

            elif geom.geom_type == 'Polygon':
                polygons_data.append(geom)

            elif geom.geom_type == 'MultiPolygon':
                for poly in geom.geoms:
                    polygons_data.append(poly)

            elif geom.geom_type == 'MultiLineString':
                for line in geom.geoms:
                    coords = list(line.coords)
                    xs = [c[0] for c in coords]
                    ys = [c[1] for c in coords]
                    zs = [floor] * len(coords)
                    lines_data.append((xs, ys, zs))

        # バッチ描画（パフォーマンス向上）
        if points_x:
            # FacilityのPointは異なるマーカー形状で表示（ノードと区別）
            if 'Facility' in geojson_file:
                # 設備は四角形マーカーで表示
                ax.scatter(points_x, points_y, points_z, c=color, s=size*1.5,
                           alpha=alpha, depthshade=False, marker='s',
                           edgecolors='darkred', linewidths=0.5, label='設備')
            else:
                ax.scatter(points_x, points_y, points_z, c=color, s=size,
                           alpha=alpha, depthshade=False)

        for xs, ys, zs in lines_data:
            ax.plot(xs, ys, zs, color=color, linewidth=size, alpha=alpha)

        for poly in polygons_data:
            plot_polygon_3d(ax, poly, floor, color, alpha)

        print(f"✓ {geojson_file} (階層: {floor})")

    except Exception as e:
        print(f"✗ {geojson_file} の読み込みエラー: {e}")

# 軸とカラーバー
ax.set_xlabel('Longitude')
ax.set_ylabel('Latitude')
ax.set_zlabel('Floor')
ax.set_title('3D 構内図統合表示 (全GeoJSONファイル)')
cbar = fig.colorbar(scatter, ax=ax, shrink=0.5, aspect=10)
cbar.set_label('Floor')

plt.tight_layout()
plt.show()
