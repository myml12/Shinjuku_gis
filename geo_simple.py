import geopandas as gpd
import matplotlib.pyplot as plt

# macOS用フォント設定（Hiragino Sans）
plt.rcParams['font.family'] = 'Hiragino Sans'
plt.rcParams['font.sans-serif'] = ['Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic',
                                   'Meiryo', 'Takao', 'IPAexGothic', 'IPAPGothic', 'VL PGothic', 'Noto Sans CJK JP']

# GeoJSON読み込み
nodes_gdf = gpd.read_file("node.geojson")
links_gdf = gpd.read_file("link.geojson")

# ノードIDと座標+floorを辞書化
node_coords = {nid: (row.geometry.x, row.geometry.y, row.floor)
               for nid, row in nodes_gdf.set_index('node_id').iterrows()}

# 3Dプロット
fig = plt.figure(figsize=(10, 8))
ax = fig.add_subplot(111, projection='3d')

# ノードを散布図
x = nodes_gdf.geometry.x
y = nodes_gdf.geometry.y
z = nodes_gdf["floor"]
scatter = ax.scatter(x, y, z, c=z, cmap='coolwarm', s=50, depthshade=True)

# リンクをノード座標に沿って描画
for idx, row in links_gdf.iterrows():
    # link.geojsonの各リンクにノードIDがあると仮定
    # ここでは link が start_id, end_id を持っている例
    if "start_id" in row and "end_id" in row:
        n1 = row["start_id"]
        n2 = row["end_id"]
        if n1 in node_coords and n2 in node_coords:
            xs = [node_coords[n1][0], node_coords[n2][0]]
            ys = [node_coords[n1][1], node_coords[n2][1]]
            zs = [node_coords[n1][2], node_coords[n2][2]]  # ノードのfloorを使う
            ax.plot(xs, ys, zs, color='lightblue', linewidth=2)

# 軸とカラーバー
ax.set_xlabel('Longitude')
ax.set_ylabel('Latitude')
ax.set_zlabel('Floor')
ax.set_title('3D Node-Link Visualization')
cbar = fig.colorbar(scatter, ax=ax, shrink=0.5, aspect=10)
cbar.set_label('Floor')

plt.show()
