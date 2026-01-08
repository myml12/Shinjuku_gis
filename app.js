// グローバル変数
let map;
let deckgl = null; // deck.glインスタンス
let allData = {
    nodes: null,
    links: null,
    floors: {},
    spaces: {},
    facilities: {}
};
let selectedNode = null;
let routeStartNode = null;
let routeEndNode = null;
let routeMode = null; // 'start' or 'end'
let graph = null; // 経路探索用のグラフ
let deckLayers = []; // deck.glレイヤー

// 階層マッピング
const floorMapping = {
    '1': 1.0,
    'B1': -1.0,
    'B2': -2.0,
    'B3': -3.0,
    'B5': -5.0,
    'B6': -6.0
};

// 地図の初期化
function initMap() {
    // ノードデータから中心座標を計算
    const center = [139.6994, 35.6870]; // デフォルト中心（後で調整）

    map = new maplibregl.Map({
        container: 'map',
        style: {
            version: 8,
            sources: {
                'carto-positron': {
                    type: 'raster',
                    tiles: [
                        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                        'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
                    ],
                    tileSize: 256,
                    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'
                }
            },
            layers: [{
                id: 'carto-positron-layer',
                type: 'raster',
                source: 'carto-positron',
                minzoom: 0,
                maxzoom: 22
            }]
        },
        center: center,
        zoom: 18,
        pitch: 75,  // 3D表示のためピッチを設定（真横から見えるように）
        bearing: 45,  // 斜めから見えるように初期方位角を設定
        maxPitch: 85  // ピッチ角度の最大値を85度に設定（MapLibre GL JSの制限）
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
        loadAllData();
    });

}

// 全データの読み込み
async function loadAllData() {
    const loadingEl = document.getElementById('loading');

    try {
        // ノードとリンクの読み込み
        const nodesResponse = await fetch('node.geojson');
        if (!nodesResponse.ok) {
            throw new Error(`node.geojsonの読み込みに失敗しました: ${nodesResponse.status} ${nodesResponse.statusText}`);
        }
        const nodesData = await nodesResponse.json();
        
        const linksResponse = await fetch('link.geojson');
        if (!linksResponse.ok) {
            throw new Error(`link.geojsonの読み込みに失敗しました: ${linksResponse.status} ${linksResponse.statusText}`);
        }
        const linksData = await linksResponse.json();

        allData.nodes = nodesData;
        allData.links = linksData;
        
        console.log('ノード数:', nodesData.features.length);
        console.log('リンク数:', linksData.features.length);

        // 階層別ファイルの読み込み
        const floors = ['1', 'B1', 'B2', 'B3', 'B5', 'B6'];
        const filePromises = [];

        floors.forEach(floor => {
            filePromises.push(
                fetch(`Shinjuku_${floor}_Floor.geojson`)
                    .then(r => {
                        if (!r.ok) {
                            console.warn(`Shinjuku_${floor}_Floor.geojsonが見つかりません`);
                            return { type: 'FeatureCollection', features: [] };
                        }
                        return r.json();
                    })
                    .then(data => {
                        allData.floors[floor] = data;
                        console.log(`${floor}階 Floor:`, data.features.length, 'features');
                    })
                    .catch(err => {
                        console.warn(`Shinjuku_${floor}_Floor.geojsonの読み込みエラー:`, err);
                        allData.floors[floor] = { type: 'FeatureCollection', features: [] };
                    })
            );
            filePromises.push(
                fetch(`Shinjuku_${floor}_Space.geojson`)
                    .then(r => {
                        if (!r.ok) {
                            console.warn(`Shinjuku_${floor}_Space.geojsonが見つかりません`);
                            return { type: 'FeatureCollection', features: [] };
                        }
                        return r.json();
                    })
                    .then(data => {
                        allData.spaces[floor] = data;
                        console.log(`${floor}階 Space:`, data.features.length, 'features');
                    })
                    .catch(err => {
                        console.warn(`Shinjuku_${floor}_Space.geojsonの読み込みエラー:`, err);
                        allData.spaces[floor] = { type: 'FeatureCollection', features: [] };
                    })
            );
            filePromises.push(
                fetch(`Shinjuku_${floor}_Facility.geojson`)
                    .then(r => {
                        if (!r.ok) {
                            console.warn(`Shinjuku_${floor}_Facility.geojsonが見つかりません`);
                            return { type: 'FeatureCollection', features: [] };
                        }
                        return r.json();
                    })
                    .then(data => {
                        allData.facilities[floor] = data;
                        console.log(`${floor}階 Facility:`, data.features.length, 'features');
                    })
                    .catch(err => {
                        console.warn(`Shinjuku_${floor}_Facility.geojsonの読み込みエラー:`, err);
                        allData.facilities[floor] = { type: 'FeatureCollection', features: [] };
                    })
            );
        });

        await Promise.all(filePromises);

        // グラフ構築
        buildGraph();

        // レイヤー追加
        addAllLayers();

        // deck.glの初期化（エラーが発生しても続行）
        try {
            initDeckGL();
        } catch (deckError) {
            console.warn('deck.glの初期化に失敗しました（続行します）:', deckError);
        }

        // ノードクリックイベントを設定
        setupNodeClickEvents();

        // 中心座標をノードデータから計算
        if (nodesData.features.length > 0) {
            const coords = nodesData.features.map(f => f.geometry.coordinates);
            const lons = coords.map(c => c[0]);
            const lats = coords.map(c => c[1]);
            const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;
            const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
            map.setCenter([centerLon, centerLat]);
        }

        loadingEl.style.display = 'none';
        console.log('データ読み込み完了');
    } catch (error) {
        console.error('データ読み込みエラー:', error);
        console.error('エラー詳細:', error.stack);
        loadingEl.innerHTML = `
            <div style="color: red; margin-bottom: 10px;">
                <strong>データの読み込みに失敗しました</strong>
            </div>
            <div style="font-size: 11px; color: #666; margin-top: 10px;">
                エラー: ${error.message || error.toString()}
            </div>
            <div style="font-size: 11px; color: #666; margin-top: 5px;">
                ブラウザのコンソール（F12）で詳細を確認してください
            </div>
            <div style="font-size: 11px; color: #666; margin-top: 10px;">
                ローカルサーバーを起動していますか？<br>
                python3 -m http.server 8000
            </div>
        `;
    }
}

// グラフ構築（経路探索用）
function buildGraph() {
    graph = {};

    // ノードをグラフに追加
    allData.nodes.features.forEach(node => {
        const nodeId = node.properties.node_id;
        graph[nodeId] = [];
    });

    console.log('グラフ構築: ノード数', Object.keys(graph).length);

    // リンクをグラフに追加
    let linkCount = 0;
    allData.links.features.forEach(link => {
        const startId = link.properties.start_id;
        const endId = link.properties.end_id;
        const distance = parseFloat(link.properties.distance) || 1.0;
        const direction = String(link.properties.direction || '1');

        // ノードが存在するか確認
        if (!graph[startId] || !graph[endId]) {
            return; // ノードが存在しない場合はスキップ
        }

        // 双方向または正方向
        if (direction === '1' || direction === '2') {
            graph[startId].push({ node: endId, distance: distance, link: link });
            linkCount++;
        }

        // 双方向または逆方向
        if (direction === '1' || direction === '3') {
            graph[endId].push({ node: startId, distance: distance, link: link });
            if (direction === '1') linkCount++; // 双方向の場合は既にカウント済み
        }
    });

    console.log('グラフ構築: 追加されたエッジ数', linkCount);

    // 接続性を確認
    const connectedNodes = Object.keys(graph).filter(nodeId => graph[nodeId].length > 0);
    console.log('接続されているノード数', connectedNodes.length, '/', Object.keys(graph).length);
}

// ノードクリックイベントの設定関数
function setupNodeClickEvents() {
    const floors = ['1', 'B1', 'B2', 'B3', 'B5', 'B6'];
    
    floors.forEach(floor => {
        if (map.getLayer(`node-layer-${floor}`)) {
            map.on('click', `node-layer-${floor}`, (e) => {
                const feature = e.features[0];
                const nodeId = feature.properties.node_id;
                selectNode(nodeId);
                
                if (routeMode === 'start') {
                    routeStartNode = nodeId;
                    routeMode = null;
                    updateRouteStatus('出発点を選択しました: ' + nodeId.substring(0, 8) + '...');
                    document.getElementById('route-start-btn').classList.remove('active');
                    updateRouteNodes();
                } else if (routeMode === 'end') {
                    routeEndNode = nodeId;
                    routeMode = null;
                    updateRouteStatus('到着点を選択しました: ' + nodeId.substring(0, 8) + '...');
                    document.getElementById('route-end-btn').classList.remove('active');
                    updateRouteNodes();
                    
                    if (routeStartNode && routeEndNode) {
                        findRoute(routeStartNode, routeEndNode);
                    }
                }
            });
            
            // マウスオーバーでカーソル変更
            map.on('mouseenter', `node-layer-${floor}`, () => {
                map.getCanvas().style.cursor = 'pointer';
            });
            
            map.on('mouseleave', `node-layer-${floor}`, () => {
                map.getCanvas().style.cursor = '';
            });
        }
    });
    
    // その他のノードレイヤーにもイベントを追加
    if (map.getLayer('node-layer-other')) {
        map.on('click', 'node-layer-other', (e) => {
            const feature = e.features[0];
            const nodeId = feature.properties.node_id;
            selectNode(nodeId);
            
            if (routeMode === 'start') {
                routeStartNode = nodeId;
                routeMode = null;
                updateRouteStatus('出発点を選択しました: ' + nodeId.substring(0, 8) + '...');
                document.getElementById('route-start-btn').classList.remove('active');
                updateRouteNodes();
            } else if (routeMode === 'end') {
                routeEndNode = nodeId;
                routeMode = null;
                updateRouteStatus('到着点を選択しました: ' + nodeId.substring(0, 8) + '...');
                document.getElementById('route-end-btn').classList.remove('active');
                updateRouteNodes();
                
                if (routeStartNode && routeEndNode) {
                    findRoute(routeStartNode, routeEndNode);
                }
            }
        });
        
        map.on('mouseenter', 'node-layer-other', () => {
            map.getCanvas().style.cursor = 'pointer';
        });
        
        map.on('mouseleave', 'node-layer-other', () => {
            map.getCanvas().style.cursor = '';
        });
    }
}

// 全レイヤーの追加
function addAllLayers() {
    const floors = ['1', 'B1', 'B2', 'B3', 'B5', 'B6'];

    // Floorレイヤー（3D表示）
    floors.forEach(floor => {
        if (allData.floors[floor] && allData.floors[floor].features.length > 0) {
            // 階層の高さを計算（メートル単位、1階層 = 3m）
            const elevation = Math.abs(floorMapping[floor]) * 3;

            // 各フィーチャーに高さ情報を追加
            const floorDataWithElevation = {
                ...allData.floors[floor],
                features: allData.floors[floor].features.map(feature => ({
                    ...feature,
                    properties: {
                        ...feature.properties,
                        elevation: elevation
                    }
                }))
            };

            map.addSource(`floor-${floor}`, {
                type: 'geojson',
                data: floorDataWithElevation
            });

            // 3D表示用のfill-extrusionレイヤー
            map.addLayer({
                id: `floor-layer-${floor}`,
                type: 'fill-extrusion',
                source: `floor-${floor}`,
                paint: {
                    'fill-extrusion-color': '#e0e0e0',
                    'fill-extrusion-opacity': 0.6,
                    'fill-extrusion-height': ['get', 'elevation'],
                    'fill-extrusion-base': ['-', ['get', 'elevation'], 0.1]
                }
            });
        }
    });

    // Spaceレイヤー（3D表示）
    floors.forEach(floor => {
        if (allData.spaces[floor] && allData.spaces[floor].features.length > 0) {
            // 階層の高さを計算（メートル単位、1階層 = 3m）
            const elevation = Math.abs(floorMapping[floor]) * 3;

            // 各フィーチャーに高さ情報を追加
            const spaceDataWithElevation = {
                ...allData.spaces[floor],
                features: allData.spaces[floor].features.map(feature => ({
                    ...feature,
                    properties: {
                        ...feature.properties,
                        elevation: elevation
                    }
                }))
            };

            map.addSource(`space-${floor}`, {
                type: 'geojson',
                data: spaceDataWithElevation
            });

            // 3D表示用のfill-extrusionレイヤー
            map.addLayer({
                id: `space-layer-${floor}`,
                type: 'fill-extrusion',
                source: `space-${floor}`,
                paint: {
                    'fill-extrusion-color': [
                        'match',
                        ['get', 'category'],
                        'B001', '#ff6b6b',  // 商業施設
                        'B002', '#4ecdc4',  // 事務所
                        'B021', '#ffd93d',  // 階段
                        'B022', '#6bcb77',  // エレベーター
                        'B029', '#e8e8e8',  // 通路
                        '#d3d3d3'  // デフォルト
                    ],
                    'fill-extrusion-opacity': 0.5,
                    'fill-extrusion-height': ['+', ['get', 'elevation'], 0.1],
                    'fill-extrusion-base': ['get', 'elevation']
                }
            });
        }
    });

    // Facilityレイヤー（3D表示）
    floors.forEach(floor => {
        if (allData.facilities[floor] && allData.facilities[floor].features.length > 0) {
            // 階層の高さを計算（メートル単位、1階層 = 3m）
            const elevation = Math.abs(floorMapping[floor]) * 3;

            map.addSource(`facility-${floor}`, {
                type: 'geojson',
                data: allData.facilities[floor]
            });

            map.addLayer({
                id: `facility-layer-${floor}`,
                type: 'circle',
                source: `facility-${floor}`,
                paint: {
                    'circle-radius': 6,
                    'circle-color': [
                        'match',
                        ['get', 'category'],
                        'F011', '#ff6b6b',  // 階段
                        'F012', '#4ecdc4',  // エレベーター
                        'F013', '#95e1d3',  // エスカレーター
                        'F027', '#ff0000',  // AED
                        '#ffa500'  // その他
                    ],
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#333',
                    'circle-translate': [0, 0],
                    'circle-translate-anchor': 'map'
                }
            });

            // 3D表示のため、circle-extrusion-heightを設定（ただしcircleレイヤーは3D非対応のため、代わりに高さを視覚的に表現）
            // 実際にはcircleレイヤーは3D非対応なので、そのまま表示
        }
    });

    // Linkレイヤー（3D表示のため、ノードの高さに基づいて表示）
    // リンクの高さをノードのfloor値から計算する必要があるため、
    // 各リンクの座標に高さ情報を追加
    const linksWithElevation = {
        ...allData.links,
        features: allData.links.features.map(link => {
            const startId = link.properties.start_id;
            const endId = link.properties.end_id;
            const startNode = allData.nodes.features.find(n => n.properties.node_id === startId);
            const endNode = allData.nodes.features.find(n => n.properties.node_id === endId);

            const startFloor = startNode ? startNode.properties.floor : 0;
            const endFloor = endNode ? endNode.properties.floor : 0;
            const startElevation = Math.abs(startFloor) * 3;
            const endElevation = Math.abs(endFloor) * 3;

            // 座標に高さを追加（GeoJSONの座標は[lon, lat]なので、3D表示のため高さを計算）
            return {
                ...link,
                properties: {
                    ...link.properties,
                    start_elevation: startElevation,
                    end_elevation: endElevation
                }
            };
        })
    };

    map.addSource('link-source', {
        type: 'geojson',
        data: linksWithElevation
    });

    map.addLayer({
        id: 'link-layer',
        type: 'line',
        source: 'link-source',
        paint: {
            'line-color': [
                'match',
                ['get', 'route_type'],
                '4', '#6bcb77',  // エレベーター
                '5', '#ffd93d',  // 階段
                '6', '#4d96ff',  // エスカレーター
                '#87ceeb'  // 一般通路
            ],
            'line-width': 2,
            'line-opacity': 0.6
        }
    });

    // Nodeレイヤー（階層ごとに分けて表示）
    // 各階層のノードを分けて表示
    floors.forEach(floor => {
        const floorValue = floorMapping[floor];
        const floorNodes = {
            type: 'FeatureCollection',
            features: allData.nodes.features.filter(node => {
                const nodeFloor = node.properties.floor;
                return nodeFloor === floorValue;
            })
        };

        if (floorNodes.features.length > 0) {
            map.addSource(`node-source-${floor}`, {
                type: 'geojson',
                data: floorNodes
            });

            map.addLayer({
                id: `node-layer-${floor}`,
                type: 'circle',
                source: `node-source-${floor}`,
                paint: {
                    'circle-radius': 4,
                    'circle-color': '#007bff',
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#fff'
                }
            });
        }
    });

    // その他の階層のノード（0階層など）
    const otherNodes = {
        type: 'FeatureCollection',
        features: allData.nodes.features.filter(node => {
            const nodeFloor = node.properties.floor;
            return !Object.values(floorMapping).includes(nodeFloor);
        })
    };

    if (otherNodes.features.length > 0) {
        map.addSource('node-source-other', {
            type: 'geojson',
            data: otherNodes
        });

        map.addLayer({
            id: 'node-layer-other',
            type: 'circle',
            source: 'node-source-other',
            paint: {
                'circle-radius': 4,
                'circle-color': '#007bff',
                'circle-stroke-width': 1,
                'circle-stroke-color': '#fff'
            }
        });
    }

    // 選択ノード用レイヤー
    map.addSource('selected-node-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
        id: 'selected-node-layer',
        type: 'circle',
        source: 'selected-node-source',
        paint: {
            'circle-radius': 8,
            'circle-color': '#ff0000',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff'
        }
    });

    // 経路探索用ノード（開始・終了）レイヤー
    map.addSource('route-node-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
        id: 'route-node-layer',
        type: 'circle',
        source: 'route-node-source',
        paint: {
            'circle-radius': 10,
            'circle-color': [
                'match',
                ['get', 'route_type'],
                'start', '#00ff00',  // 開始ノード: 緑
                'end', '#ff00ff',    // 終了ノード: マゼンタ
                '#00ff00'
            ],
            'circle-stroke-width': 3,
            'circle-stroke-color': '#fff'
        }
    });

    // 経路表示用レイヤー
    map.addSource('route-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
        id: 'route-layer',
        type: 'line',
        source: 'route-source',
        paint: {
            'line-color': '#ff0000',
            'line-width': 4,
            'line-opacity': 0.8
        }
    });
}

// deck.glの初期化（MapLibre GL JSのカスタムレイヤーとして）
function initDeckGL() {
    if (typeof deck === 'undefined') {
        console.warn('deck.gl is not loaded - deck.glなしで続行します');
        return;
    }
    
    try {

    // MapLibre GL JSのカスタムレイヤーとしてdeck.glを追加
    class DeckGLLayer {
        constructor() {
            this.id = 'deckgl-layer';
            this.type = 'custom';
            this.renderingMode = '3d';
        }

        onAdd(map, gl) {
            this.map = map;
            this.gl = gl;
            // deck.glの初期化（MapLibre GL JSのWebGLコンテキストを使用）
            try {
                // deck.gl v9のAPIを使用
                if (typeof deck === 'undefined' || !deck.Deck) {
                    console.warn('deck.glが見つかりません');
                    this.deckgl = null;
                    return;
                }
                
                const center = map.getCenter();
                // deck.gl v9のAPIを使用
                // MapLibre GL JSのWebGLコンテキストを直接使用
                this.deckgl = new deck.Deck({
                    gl: gl,
                    initialViewState: {
                        longitude: center.lng,
                        latitude: center.lat,
                        zoom: map.getZoom(),
                        pitch: map.getPitch(),
                        bearing: map.getBearing()
                    },
                    controller: false,
                    layers: [],
                    // deck.gl v9では、MapLibre GL JSとの統合時に特別な設定が必要
                    _typedArrayManagerProps: {
                        overAlloc: 1,
                        poolSize: 0
                    }
                });
            } catch (error) {
                console.error('deck.glの初期化エラー:', error);
                this.deckgl = null;
            }
        }

        render(gl, matrix) {
            if (!this.deckgl) return;
            
            try {
                const center = this.map.getCenter();
                const viewState = {
                    longitude: center.lng,
                    latitude: center.lat,
                    zoom: this.map.getZoom(),
                    pitch: this.map.getPitch(),
                    bearing: this.map.getBearing()
                };
                
                // deck.gl v9のAPIを使用してレイヤーを更新
                if (this.deckgl && typeof this.deckgl.setProps === 'function') {
                    this.deckgl.setProps({
                        viewState: viewState,
                        layers: deckLayers
                    });
                } else if (this.deckgl) {
                    // フォールバック: 直接propsを更新
                    if (this.deckgl.props) {
                        this.deckgl.props.viewState = viewState;
                        this.deckgl.props.layers = deckLayers;
                    }
                }
            } catch (error) {
                console.warn('deck.glレンダリングエラー:', error);
            }
        }
    }
    
    try {
        const layer = new DeckGLLayer();
        map.addLayer(layer);
        deckgl = layer.deckgl;
        
        // 初期レイヤーを追加
        updateDeckLayers();
        console.log('deck.glの初期化が完了しました');
    } catch (error) {
        console.error('deck.glの初期化エラー:', error);
        // deck.glの初期化に失敗しても続行
    }
}

// deck.glレイヤーの更新
function updateDeckLayers() {
    if (!deckgl || !allData.nodes) {
        // deck.glが初期化されていない場合はスキップ
        return;
    }
    
    try {
        const layers = [];
        const floors = ['1', 'B1', 'B2', 'B3', 'B5', 'B6'];

    // Floorレイヤー（3D Polygon）
    floors.forEach(floor => {
        if (allData.floors[floor] && allData.floors[floor].features.length > 0) {
            const elevation = Math.abs(floorMapping[floor]) * 3;
            const floorData = allData.floors[floor].features.map(feature => ({
                ...feature,
                properties: {
                    ...feature.properties,
                    elevation: elevation
                }
            }));

            layers.push(new deck.PolygonLayer({
                id: `deck-floor-${floor}`,
                data: floorData,
                getPolygon: d => d.geometry.coordinates[0],
                getElevation: d => d.properties.elevation || 0,
                getFillColor: [224, 224, 224, 150],
                getLineColor: [200, 200, 200, 200],
                lineWidthMinPixels: 1,
                extruded: true,
                wireframe: false,
                pickable: false
            }));
        }
    });

    // Spaceレイヤー（3D Polygon）
    floors.forEach(floor => {
        if (allData.spaces[floor] && allData.spaces[floor].features.length > 0) {
            const elevation = Math.abs(floorMapping[floor]) * 3;
            const spaceData = allData.spaces[floor].features.map(feature => {
                const category = feature.properties.category || '';
                let color = [211, 211, 211, 120];

                if (category === 'B001') color = [255, 107, 107, 150];
                else if (category === 'B002') color = [78, 205, 196, 150];
                else if (category === 'B021') color = [255, 217, 61, 150];
                else if (category === 'B022') color = [107, 203, 119, 150];
                else if (category === 'B029') color = [232, 232, 232, 150];

                return {
                    ...feature,
                    properties: {
                        ...feature.properties,
                        elevation: elevation,
                        color: color
                    }
                };
            });

            layers.push(new deck.PolygonLayer({
                id: `deck-space-${floor}`,
                data: spaceData,
                getPolygon: d => d.geometry.coordinates[0],
                getElevation: d => (d.properties.elevation || 0) + 0.1,
                getFillColor: d => d.properties.color || [211, 211, 211, 120],
                getLineColor: [150, 150, 150, 100],
                lineWidthMinPixels: 0.5,
                extruded: true,
                wireframe: false,
                pickable: true,
                onHover: info => {
                    if (info.object) {
                        map.getCanvas().style.cursor = 'pointer';
                    } else {
                        map.getCanvas().style.cursor = '';
                    }
                }
            }));
        }
    });

    // Linkレイヤー（3D Line）
    if (allData.links && allData.links.features.length > 0) {
        const linkData = allData.links.features.map(link => {
            const startId = link.properties.start_id;
            const endId = link.properties.end_id;
            const startNode = allData.nodes.features.find(n => n.properties.node_id === startId);
            const endNode = allData.nodes.features.find(n => n.properties.node_id === endId);

            const startFloor = startNode ? startNode.properties.floor : 0;
            const endFloor = endNode ? endNode.properties.floor : 0;
            const startElevation = Math.abs(startFloor) * 3;
            const endElevation = Math.abs(endFloor) * 3;

            const routeType = link.properties.route_type || '7';
            let color = [135, 206, 235, 150];

            if (routeType === '4') color = [107, 203, 119, 200];
            else if (routeType === '5') color = [255, 217, 61, 200];
            else if (routeType === '6') color = [77, 150, 255, 200];

            return {
                ...link,
                properties: {
                    ...link.properties,
                    startElevation: startElevation,
                    endElevation: endElevation,
                    color: color
                }
            };
        });

        layers.push(new deck.PathLayer({
            id: 'deck-link',
            data: linkData,
            getPath: d => d.geometry.coordinates,
            getColor: d => d.properties.color || [135, 206, 235, 150],
            getWidth: 2,
            widthMinPixels: 1,
            widthMaxPixels: 5,
            pickable: false,
            billboard: false
        }));
    }

    // Nodeレイヤー（3D Scatterplot）
    if (allData.nodes && allData.nodes.features.length > 0) {
        const nodeData = allData.nodes.features.map(node => {
            const elevation = Math.abs(node.properties.floor) * 3;
            return {
                ...node,
                position: [node.geometry.coordinates[0], node.geometry.coordinates[1], elevation],
                properties: {
                    ...node.properties,
                    elevation: elevation
                }
            };
        });

        layers.push(new deck.ScatterplotLayer({
            id: 'deck-node',
            data: nodeData,
            getPosition: d => d.position,
            getFillColor: [0, 123, 255, 200],
            getRadius: 3,
            radiusMinPixels: 2,
            radiusMaxPixels: 8,
            pickable: true,
            onClick: info => {
                if (info.object) {
                    const nodeId = info.object.properties.node_id;
                    selectNode(nodeId);

                    if (routeMode === 'start') {
                        routeStartNode = nodeId;
                        routeMode = null;
                        updateRouteStatus('出発点を選択しました: ' + nodeId.substring(0, 8) + '...');
                        document.getElementById('route-start-btn').classList.remove('active');
                        updateRouteNodes();
                    } else if (routeMode === 'end') {
                        routeEndNode = nodeId;
                        routeMode = null;
                        updateRouteStatus('到着点を選択しました: ' + nodeId.substring(0, 8) + '...');
                        document.getElementById('route-end-btn').classList.remove('active');
                        updateRouteNodes();

                        if (routeStartNode && routeEndNode) {
                            findRoute(routeStartNode, routeEndNode);
                        }
                    }
                }
            },
            onHover: info => {
                if (info.object) {
                    map.getCanvas().style.cursor = 'pointer';
                } else {
                    map.getCanvas().style.cursor = '';
                }
            }
        }));
    }

    // 選択ノードレイヤー
    if (selectedNode) {
        const node = allData.nodes.features.find(f => f.properties.node_id === selectedNode);
        if (node) {
            const elevation = Math.abs(node.properties.floor) * 3;
            layers.push(new deck.ScatterplotLayer({
                id: 'deck-selected-node',
                data: [{
                    position: [node.geometry.coordinates[0], node.geometry.coordinates[1], elevation],
                    properties: node.properties
                }],
                getPosition: d => d.position,
                getFillColor: [255, 0, 0, 255],
                getRadius: 8,
                radiusMinPixels: 6,
                radiusMaxPixels: 12,
                pickable: false
            }));
        }
    }

    // 経路レイヤー
    if (routeStartNode && routeEndNode) {
        const startNode = allData.nodes.features.find(f => f.properties.node_id === routeStartNode);
        const endNode = allData.nodes.features.find(f => f.properties.node_id === routeEndNode);

        if (startNode && endNode) {
            layers.push(new deck.ScatterplotLayer({
                id: 'deck-route-nodes',
                data: [
                    {
                        position: [startNode.geometry.coordinates[0], startNode.geometry.coordinates[1], Math.abs(startNode.properties.floor) * 3],
                        properties: { type: 'start' }
                    },
                    {
                        position: [endNode.geometry.coordinates[0], endNode.geometry.coordinates[1], Math.abs(endNode.properties.floor) * 3],
                        properties: { type: 'end' }
                    }
                ],
                getPosition: d => d.position,
                getFillColor: d => d.properties.type === 'start' ? [0, 255, 0, 255] : [255, 0, 255, 255],
                getRadius: 10,
                radiusMinPixels: 8,
                radiusMaxPixels: 15,
                pickable: false
            }));
        }
    }

    // 経路線レイヤー（経路探索結果がある場合）
    const routeSource = map.getSource('route-source');
    if (routeSource && routeSource._data && routeSource._data.features.length > 0) {
        const routeFeature = routeSource._data.features[0];
        if (routeFeature.geometry.type === 'LineString') {
            const routeCoordinates = routeFeature.geometry.coordinates.map(coord => {
                const node = allData.nodes.features.find(n =>
                    Math.abs(n.geometry.coordinates[0] - coord[0]) < 0.0001 &&
                    Math.abs(n.geometry.coordinates[1] - coord[1]) < 0.0001
                );
                const elevation = node ? Math.abs(node.properties.floor) * 3 : 0;
                return [coord[0], coord[1], elevation];
            });

            layers.push(new deck.PathLayer({
                id: 'deck-route',
                data: [{
                    path: routeCoordinates,
                    properties: { route: true }
                }],
                getPath: d => d.path,
                getColor: [255, 0, 0, 255],
                getWidth: 5,
                widthMinPixels: 4,
                widthMaxPixels: 8,
                pickable: false
            }));
        }
    }

        deckLayers = layers;
    } catch (error) {
        console.error('deck.glレイヤーの更新エラー:', error);
        // エラーが発生しても続行
    }
}

// ノード選択
function selectNode(nodeId) {
    selectedNode = nodeId;

    const node = allData.nodes.features.find(f => f.properties.node_id === nodeId);
    if (!node) return;

    // 選択ノードをハイライト（MapLibre GL JS）
    map.getSource('selected-node-source').setData({
        type: 'FeatureCollection',
        features: [node]
    });

    // deck.glレイヤーを更新
    updateDeckLayers();

    // ノード情報を表示
    displayNodeInfo(node.properties);

    // 接続リンクをハイライト
    highlightConnectedLinks(nodeId);
}

// ノード情報表示
function displayNodeInfo(props) {
    const infoSection = document.getElementById('node-info-section');
    const infoDiv = document.getElementById('node-info');

    let html = '';
    html += `<div class="info-item"><span class="info-label">Node ID:</span> ${props.node_id.substring(0, 16)}...</div>`;
    html += `<div class="info-item"><span class="info-label">階層:</span> ${props.floor}</div>`;
    html += `<div class="info-item"><span class="info-label">緯度:</span> ${props.lat.toFixed(6)}</div>`;
    html += `<div class="info-item"><span class="info-label">経度:</span> ${props.lon.toFixed(6)}</div>`;

    const links = [];
    for (let i = 1; i <= 8; i++) {
        const linkId = props[`link${i}_id`];
        if (linkId && linkId.trim() !== '') {
            links.push(linkId);
        }
    }
    html += `<div class="info-item"><span class="info-label">接続リンク数:</span> ${links.length}</div>`;

    infoDiv.innerHTML = html;
    infoSection.style.display = 'block';
}

// 接続リンクのハイライト
function highlightConnectedLinks(nodeId) {
    const connectedLinks = allData.links.features.filter(link => {
        return link.properties.start_id === nodeId || link.properties.end_id === nodeId;
    });

    // リンクレイヤーのフィルターを更新（将来的に実装）
}

// 経路探索（Dijkstraアルゴリズム）
function findRoute(startId, endId) {
    console.log('経路探索開始:', startId.substring(0, 8), '->', endId.substring(0, 8));

    if (!graph) {
        console.error('グラフが構築されていません');
        updateRouteStatus('グラフが構築されていません');
        return;
    }

    if (!graph[startId]) {
        console.error('開始ノードが見つかりません:', startId);
        updateRouteStatus('開始ノードが見つかりません');
        return;
    }

    if (!graph[endId]) {
        console.error('終了ノードが見つかりません:', endId);
        updateRouteStatus('終了ノードが見つかりません');
        return;
    }

    if (startId === endId) {
        updateRouteStatus('出発点と到着点が同じです');
        return;
    }

    const distances = {};
    const previous = {};
    const unvisited = new Set();

    // 初期化
    Object.keys(graph).forEach(nodeId => {
        distances[nodeId] = Infinity;
        previous[nodeId] = null;
        unvisited.add(nodeId);
    });

    distances[startId] = 0;

    // Dijkstraアルゴリズム
    while (unvisited.size > 0) {
        // 最小距離のノードを選択
        let minNode = null;
        let minDist = Infinity;

        unvisited.forEach(nodeId => {
            if (distances[nodeId] < minDist) {
                minDist = distances[nodeId];
                minNode = nodeId;
            }
        });

        if (minNode === null) {
            console.log('到達不可能なノードがあります');
            break;
        }

        if (minNode === endId) {
            console.log('終了ノードに到達しました');
            break;
        }

        unvisited.delete(minNode);

        // 隣接ノードの距離を更新
        if (graph[minNode]) {
            graph[minNode].forEach(neighbor => {
                if (unvisited.has(neighbor.node)) {
                    const alt = distances[minNode] + neighbor.distance;
                    if (alt < distances[neighbor.node]) {
                        distances[neighbor.node] = alt;
                        previous[neighbor.node] = { node: minNode, link: neighbor.link };
                    }
                }
            });
        }
    }

    // 経路を構築（ノードIDのリストとして）
    const nodePath = [];
    let current = endId;

    if (distances[endId] === Infinity) {
        console.log('経路が見つかりませんでした（到達不可能）');
        updateRouteStatus('経路が見つかりませんでした（到達不可能）');
        return;
    }

    // 終点から始点までノードを逆順で取得
    while (current !== null) {
        nodePath.unshift(current);
        if (current === startId) {
            break;
        }
        if (previous[current] === null) {
            console.log('経路構築エラー: previousがnull', current?.substring(0, 8));
            updateRouteStatus('経路が見つかりませんでした');
            return;
        }
        current = previous[current].node;
    }

    // 開始ノードまで到達したか確認
    if (nodePath.length === 0 || nodePath[0] !== startId) {
        console.log('経路構築エラー: nodePath.length=', nodePath.length, 'first=', nodePath[0]?.substring(0, 8), 'startId=', startId.substring(0, 8));
        updateRouteStatus('経路が見つかりませんでした');
        return;
    }

    console.log('経路が見つかりました: ノード数', nodePath.length);

    // 経路を表示（ノードの座標から1本の線を作成）
    displayRouteFromNodes(nodePath);

    // deck.glレイヤーを更新
    updateDeckLayers();

    // 距離を計算
    let totalDistance = 0;
    for (let i = 0; i < nodePath.length - 1; i++) {
        const link = allData.links.features.find(l =>
            (l.properties.start_id === nodePath[i] && l.properties.end_id === nodePath[i + 1]) ||
            (l.properties.end_id === nodePath[i] && l.properties.start_id === nodePath[i + 1])
        );
        if (link) {
            totalDistance += parseFloat(link.properties.distance) || 0;
        }
    }

    updateRouteStatus(`経路が見つかりました (距離: ${totalDistance.toFixed(1)}m, ノード数: ${nodePath.length})`);
}

// 経路表示（ノードの座標から1本の連続した線を作成）
function displayRouteFromNodes(nodeIds) {
    if (nodeIds.length === 0) return;

    // ノードIDから座標を取得
    const coordinates = nodeIds.map(nodeId => {
        const node = allData.nodes.features.find(f => f.properties.node_id === nodeId);
        if (!node) {
            console.warn('ノードが見つかりません:', nodeId);
            return null;
        }
        const elevation = Math.abs(node.properties.floor) * 3;
        return [node.geometry.coordinates[0], node.geometry.coordinates[1], elevation];
    }).filter(coord => coord !== null);

    if (coordinates.length < 2) {
        console.error('経路の座標が不足しています');
        return;
    }

    // MapLibre GL JS用の2D座標
    const coordinates2D = coordinates.map(c => [c[0], c[1]]);
    const routeFeature = {
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates: coordinates2D
        },
        properties: {
            route: true
        }
    };

    map.getSource('route-source').setData({
        type: 'FeatureCollection',
        features: [routeFeature]
    });

    // deck.gl用の3D経路レイヤーを追加（updateDeckLayersで処理）

    console.log('経路を表示しました: 座標数', coordinates.length);
}

// 経路探索用ノードの更新
function updateRouteNodes() {
    const features = [];

    if (routeStartNode) {
        const startNode = allData.nodes.features.find(f => f.properties.node_id === routeStartNode);
        if (startNode) {
            features.push({
                ...startNode,
                properties: {
                    ...startNode.properties,
                    route_type: 'start'
                }
            });
        }
    }

    if (routeEndNode) {
        const endNode = allData.nodes.features.find(f => f.properties.node_id === routeEndNode);
        if (endNode) {
            features.push({
                ...endNode,
                properties: {
                    ...endNode.properties,
                    route_type: 'end'
                }
            });
        }
    }

    map.getSource('route-node-source').setData({
        type: 'FeatureCollection',
        features: features
    });
}

// 経路ステータス更新
function updateRouteStatus(message) {
    document.getElementById('route-status').textContent = message;
}

// UIイベントハンドラー
document.getElementById('floor-select').addEventListener('change', (e) => {
    const selectedFloor = e.target.value;
    // 階層フィルター実装（将来的に）
});

// 3D表示制御
document.getElementById('3d-toggle').addEventListener('change', (e) => {
    const enabled = e.target.checked;
    if (enabled) {
        map.setPitch(parseInt(document.getElementById('pitch-slider').value));
        map.setBearing(parseInt(document.getElementById('bearing-slider').value));
    } else {
        map.setPitch(0);
        map.setBearing(0);
    }
});

document.getElementById('pitch-slider').addEventListener('input', (e) => {
    const pitch = parseInt(e.target.value);
    document.getElementById('pitch-value').textContent = pitch;
    if (document.getElementById('3d-toggle').checked) {
        map.setPitch(pitch);
    }
});

document.getElementById('bearing-slider').addEventListener('input', (e) => {
    const bearing = parseInt(e.target.value);
    document.getElementById('bearing-value').textContent = bearing;
    if (document.getElementById('3d-toggle').checked) {
        map.setBearing(bearing);
    }
});

// ビューポイントのプリセット
document.getElementById('view-top').addEventListener('click', () => {
    document.getElementById('pitch-slider').value = 0;
    document.getElementById('bearing-slider').value = 0;
    document.getElementById('pitch-value').textContent = '0';
    document.getElementById('bearing-value').textContent = '0';
    map.setPitch(0);
    map.setBearing(0);
});

document.getElementById('view-side').addEventListener('click', () => {
    document.getElementById('pitch-slider').value = 90;
    document.getElementById('bearing-slider').value = 45;
    document.getElementById('pitch-value').textContent = '90';
    document.getElementById('bearing-value').textContent = '45';
    map.setPitch(90);
    map.setBearing(45);
});

document.getElementById('view-reset').addEventListener('click', () => {
    document.getElementById('pitch-slider').value = 75;
    document.getElementById('bearing-slider').value = 45;
    document.getElementById('pitch-value').textContent = '75';
    document.getElementById('bearing-value').textContent = '45';
    map.setPitch(75);
    map.setBearing(45);
});

document.getElementById('route-start-btn').addEventListener('click', () => {
    routeMode = 'start';
    routeEndNode = null;
    document.getElementById('route-start-btn').classList.add('active');
    document.getElementById('route-end-btn').classList.remove('active');
    updateRouteStatus('出発点をクリックしてください');
});

document.getElementById('route-end-btn').addEventListener('click', () => {
    routeMode = 'end';
    document.getElementById('route-end-btn').classList.add('active');
    document.getElementById('route-start-btn').classList.remove('active');
    updateRouteStatus('到着点をクリックしてください');
});

document.getElementById('route-clear-btn').addEventListener('click', () => {
    routeStartNode = null;
    routeEndNode = null;
    routeMode = null;
    document.getElementById('route-start-btn').classList.remove('active');
    document.getElementById('route-end-btn').classList.remove('active');
    map.getSource('route-source').setData({ type: 'FeatureCollection', features: [] });
    map.getSource('route-node-source').setData({ type: 'FeatureCollection', features: [] });
    updateRouteStatus('');
    updateDeckLayers();
});

// レイヤー表示切り替え
['floor', 'space', 'facility', 'link', 'node'].forEach(layerType => {
    document.getElementById(`layer-${layerType}`).addEventListener('change', (e) => {
        const visible = e.target.checked;
        const floors = ['1', 'B1', 'B2', 'B3', 'B5', 'B6'];

        if (layerType === 'link') {
            map.setLayoutProperty('link-layer', 'visibility', visible ? 'visible' : 'none');
        } else if (layerType === 'node') {
            // ノードレイヤーは階層ごとに分かれている
            floors.forEach(floor => {
                const layerId = `node-layer-${floor}`;
                if (map.getLayer(layerId)) {
                    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
                }
            });
            // その他のノードレイヤー
            if (map.getLayer('node-layer-other')) {
                map.setLayoutProperty('node-layer-other', 'visibility', visible ? 'visible' : 'none');
            }
        } else {
            floors.forEach(floor => {
                const layerId = `${layerType}-layer-${floor}`;
                if (map.getLayer(layerId)) {
                    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
                }
            });
        }
    });
});

// 初期化
initMap();

