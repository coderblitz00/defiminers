import React, { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Ore, OreType } from "@/interfaces/OreTypes";
import { Miner } from "@/interfaces/MinerTypes";
import { MineMap } from "@/constants/Map";
import { MineTypes } from "@/constants/Mine";
import {
  loadSprite,
  preloadSprites,
  createTilesetTexture,
} from "@/utils/spriteLoader";
import { generateRandomOreType, createOre } from "@/lib/ores";

interface AnimatedSprite extends PIXI.Sprite {
  userData: {
    frame: number;
    animationSpeed: number;
    time: number;
  };
}

interface PixiMiningAreaProps {
  miners: Miner[];
  ores: Ore[];
  activeMine?: string;
  onOreClick?: (ore: Ore) => void;
  onBaseClick?: () => void;
  isBlackout?: boolean;
}

// Function to find valid positions for ores on the map
const findValidOrePositions = (
  map: typeof MineMap
): Array<{ x: number; y: number }> => {
  const validPositions: Array<{ x: number; y: number }> = [];
  const floorLayer = map.layers.find((l) => l.name === "Floor");
  const mountainLayer = map.layers.find((l) => l.name === "Mountains");

  if (!floorLayer || !mountainLayer) return validPositions;

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const index = y * map.width + x;
      const floorTile = floorLayer.data[index];
      const mountainTile = mountainLayer.data[index];

      // Check if the position is valid (has floor and no mountain)
      if (floorTile !== 0 && mountainTile === 0) {
        // Convert to percentage coordinates
        validPositions.push({
          x: (x / map.width) * 100,
          y: (y / map.height) * 100,
        });
      }
    }
  }

  return validPositions;
};

// Function to generate ores at valid positions
const generateOresAtPositions = (
  positions: Array<{ x: number; y: number }>,
  count: number,
  rareOreChance: number = 1
): Ore[] => {
  const ores: Ore[] = [];
  const availablePositions = [...positions];

  // Shuffle positions
  for (let i = availablePositions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availablePositions[i], availablePositions[j]] = [
      availablePositions[j],
      availablePositions[i],
    ];
  }

  // Take only the number of positions we need
  const selectedPositions = availablePositions.slice(0, count);

  // Generate ores at selected positions
  for (const position of selectedPositions) {
    const type = generateRandomOreType(rareOreChance);
    ores.push(createOre(type, position));
  }

  return ores;
};

export const PixiMiningArea = ({
  miners,
  ores,
  activeMine = "starter",
  onOreClick,
  onBaseClick,
  isBlackout = false,
}: PixiMiningAreaProps) => {
  const pixiContainerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(5);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  // Flag to track if initialization has been attempted and completed
  const initAttemptedRef = useRef(false);
  const initCompletedRef = useRef(false);
  const lightSpritesRef = useRef<AnimatedSprite[]>([]);

  // Add animation constants
  const LIGHT_ANIMATION_FRAMES = 4;
  const LIGHT_ANIMATION_SPEED = 0.1;

  // Get base position from game logic
  const getBasePosition = () => {
    const mine = MineTypes.find((m) => m.id === activeMine);
    return mine ? mine.basePosition : { x: 15, y: 15 };
  };

  const basePosition = getBasePosition();

  // Progress simulation with timeout
  useEffect(() => {
    if (loading && !initCompletedRef.current) {
      const progressInterval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev < 90) return prev + 5;
          return prev;
        });
      }, 200);

      const timeoutId = setTimeout(() => {
        if (loading && !initCompletedRef.current) {
          console.error("PixiJS initialization timed out");
          setLoadingError("Initialization timed out. Using fallback renderer.");
          clearInterval(progressInterval);
          setLoadingProgress(100);
          setTimeout(() => setLoading(false), 500);
        }
      }, 10000);

      return () => {
        clearInterval(progressInterval);
        clearTimeout(timeoutId);
      };
    }
  }, [loading]);

  // Update game state
  const updateGame = React.useCallback(
    (app: PIXI.Application, container: PIXI.Container) => {
      // Update miner positions and states
      miners.forEach((miner) => {
        // Update miner sprite position and state
        const minerSprite = container.getChildByName(`miner-${miner.id}`);
        if (minerSprite instanceof PIXI.Sprite) {
          minerSprite.x = (miner.position.x / 100) * app.screen.width;
          minerSprite.y = (miner.position.y / 100) * app.screen.height;

          // Update mining progress bar if mining
          if (miner.state === "mining") {
            const progressBar = minerSprite.getChildByName("progress-bar");
            if (progressBar instanceof PIXI.Graphics) {
              progressBar.clear();
              progressBar.beginFill(0x000000, 0.5);
              progressBar.drawRect(-10, -15, 20, 4);
              progressBar.endFill();
              progressBar.beginFill(0x8b5cf6);
              progressBar.drawRect(-10, -15, miner.miningProgress * 20, 4);
              progressBar.endFill();
            }
          }
        }
      });

      // Update ore states
      ores.forEach((ore) => {
        const oreSprite = container.getChildByName(`ore-${ore.id}`);
        if (oreSprite instanceof PIXI.Sprite) {
          oreSprite.alpha = ore.depleted ? 0.4 : 1;

          // Update regeneration timer if depleted
          if (ore.depleted) {
            const timerText = oreSprite.getChildByName("timer-text");
            if (timerText instanceof PIXI.Text) {
              timerText.text = Math.ceil(ore.regenerationTime).toString();
            }
          }
        }
      });
    },
    [miners, ores]
  );

  // Setup interactivity for ores and base
  const setupInteractivity = React.useCallback(
    (app: PIXI.Application, container: PIXI.Container) => {
      // Add base station
      const baseSprite = new PIXI.Sprite();
      baseSprite.x = (basePosition.x / 100) * app.screen.width;
      baseSprite.y = (basePosition.y / 100) * app.screen.height;
      baseSprite.width = 56; // 14 * 4
      baseSprite.height = 56;
      baseSprite.eventMode = "static";
      baseSprite.cursor = "pointer";
      baseSprite.on("pointerdown", () => {
        if (!isBlackout && onBaseClick) {
          onBaseClick();
        }
      });
      container.addChild(baseSprite);

      // Add miners
      miners.forEach((miner) => {
        const minerSprite = new PIXI.Sprite();
        minerSprite.name = `miner-${miner.id}`;
        minerSprite.x = (miner.position.x / 100) * app.screen.width;
        minerSprite.y = (miner.position.y / 100) * app.screen.height;
        minerSprite.width = 32; // Adjust size as needed
        minerSprite.height = 32;
        minerSprite.anchor.set(0.5); // Center the sprite

        // Add mining progress bar
        const progressBar = new PIXI.Graphics();
        progressBar.name = "progress-bar";
        progressBar.visible = false;
        minerSprite.addChild(progressBar);

        // Add miner name text
        const nameText = new PIXI.Text(miner.name, {
          fontSize: 12,
          fill: 0xffffff,
          align: "center",
        });
        nameText.anchor.set(0.5, -1);
        nameText.y = -20;
        minerSprite.addChild(nameText);

        container.addChild(minerSprite);
      });

      // Add ore nodes
      ores.forEach((ore) => {
        const oreSprite = new PIXI.Sprite();
        oreSprite.name = `ore-${ore.id}`;
        oreSprite.x = (ore.position.x / 100) * app.screen.width;
        oreSprite.y = (ore.position.y / 100) * app.screen.height;
        oreSprite.width = 16;
        oreSprite.height = 16;
        oreSprite.eventMode = "static";
        oreSprite.cursor = "pointer";
        oreSprite.on("pointerdown", () => {
          if (!isBlackout && onOreClick) {
            onOreClick(ore);
          }
        });

        // Add regeneration timer text
        const timerText = new PIXI.Text("", {
          fontSize: 12,
          fill: 0xffffff,
          align: "center",
        });
        timerText.name = "timer-text";
        timerText.anchor.set(0.5, -1);
        timerText.y = -10;
        oreSprite.addChild(timerText);

        container.addChild(oreSprite);
      });
    },
    [basePosition, isBlackout, onBaseClick, onOreClick, ores, miners]
  );

  // Render map layers with sprites
  const renderMapLayers = React.useCallback(
    async (app: PIXI.Application, container: PIXI.Container) => {
      try {
        // First, load all tileset textures
        const tilesetTextures: { [key: string]: PIXI.BaseTexture } = {};
        for (const tileset of MineMap.tilesets) {
          if (tileset.image) {
            try {
              const texture = await loadSprite(tileset.image);
              tilesetTextures[tileset.name] = texture.baseTexture;
            } catch (error) {
              console.error(`Failed to load tileset: ${tileset.name}`, error);
            }
          }
        }

        // Load miner sprite
        try {
          // const minerTexture = await loadSprite(
          //   "/assets/character/tools_drill/chracter_body/character_tools_drill_body_brown.png"
          // );
          // tilesetTextures["miner"] = minerTexture.baseTexture;
        } catch (error) {
          console.error("Failed to load miner sprite:", error);
        }

        // Create containers for each layer
        const layerContainers: { [key: string]: PIXI.Container } = {};
        MineMap.layers.forEach((layer) => {
          const layerContainer = new PIXI.Container();
          layerContainer.name = layer.name;
          container.addChild(layerContainer);
          layerContainers[layer.name] = layerContainer;
        });

        // Render each layer
        for (const layer of MineMap.layers) {
          const layerContainer = layerContainers[layer.name];
          if (!layerContainer) continue;

          layerContainer.removeChildren();

          if (layer.type === "tilelayer") {
            for (let i = 0; i < layer.data.length; i++) {
              const tileId = layer.data[i];
              if (tileId === 0) continue; // skip empty tiles

              const x = (i % layer.width) * MineMap.tilewidth;
              const y = Math.floor(i / layer.width) * MineMap.tileheight;

              // Find the tileset for this tile
              const tileset = MineMap.tilesets.find(
                (ts) =>
                  tileId >= ts.firstgid &&
                  tileId < ts.firstgid + (ts.tilecount || 0)
              );

              if (tileset && tilesetTextures[tileset.name]) {
                // Create a texture for this specific tile
                const tileTexture = createTilesetTexture(
                  tilesetTextures[tileset.name],
                  tileId,
                  tileset
                );

                // Create and position the sprite
                const tile = new PIXI.Sprite(tileTexture);
                tile.x = x;
                tile.y = y;
                layerContainer.addChild(tile);
              }
            }
          } else if (layer.type === "objectgroup") {
            if (layer.name === "Light") {
              // Clear previous light sprites
              lightSpritesRef.current.forEach(sprite => sprite.destroy());
              lightSpritesRef.current = [];

              // Create light sprites
              for (const object of layer.objects) {
                if (object.gid) {
                  const tileset = MineMap.tilesets.find(
                    (ts) =>
                      object.gid >= ts.firstgid &&
                      object.gid < ts.firstgid + (ts.tilecount || 0)
                  );

                  if (tileset && tilesetTextures[tileset.name]) {
                    // Create a texture for this specific tile
                    const tileTexture = createTilesetTexture(
                      tilesetTextures[tileset.name],
                      object.gid,
                      tileset
                    );

                    // Create and position the sprite
                    const sprite = new PIXI.Sprite(tileTexture) as AnimatedSprite;
                    sprite.x = object.x;
                    sprite.y = object.y;
                    sprite.width = object.width;
                    sprite.height = object.height;
                    
                    // Add animation properties
                    sprite.userData = {
                      frame: 0,
                      animationSpeed: LIGHT_ANIMATION_SPEED,
                      time: 0
                    };

                    layerContainer.addChild(sprite as PIXI.Sprite);
                    lightSpritesRef.current.push(sprite);
                  }
                }
              }
            }
          }
        }

        // Find valid positions for ores
        const validPositions = findValidOrePositions(MineMap);

        // Generate ores at valid positions
        const generatedOres = generateOresAtPositions(
          validPositions,
          ores.length,
          MineTypes.find((m) => m.id === activeMine)?.rareOreChance || 1
        );
        console.log(generatedOres);

        // Update ore positions with generated positions
        ores.forEach((ore, index) => {
          if (generatedOres[index]) {
            ore.position = generatedOres[index].position;
          }
        });

        // Update miner sprites with texture
        miners.forEach((miner) => {
          const minerSprite = container.getChildByName(`miner-${miner.id}`);
          if (minerSprite instanceof PIXI.Sprite && tilesetTextures["miner"]) {
            minerSprite.texture = new PIXI.Texture(tilesetTextures["miner"]);
          }
        });

        // Add animation ticker
        app.ticker.add((delta) => {
          lightSpritesRef.current.forEach(sprite => {
            sprite.userData.time += delta;
            if (sprite.userData.time >= sprite.userData.animationSpeed) {
              sprite.userData.time = 0;
              sprite.userData.frame = (sprite.userData.frame + 1) % LIGHT_ANIMATION_FRAMES;
              
              // Update sprite texture based on frame
              const tileset = MineMap.tilesets.find(
                (ts) => ts.name === "mine_props"
              );
              if (tileset && tilesetTextures[tileset.name]) {
                const baseGid = 3364; // Base GID for light animation
                const newGid = baseGid + sprite.userData.frame;
                const tileTexture = createTilesetTexture(
                  tilesetTextures[tileset.name],
                  newGid,
                  tileset
                );
                sprite.texture = tileTexture;
              }
            }
          });
        });

      } catch (error) {
        console.error("Error rendering map layers:", error);
      }
    },
    [miners, ores, activeMine]
  );

  // Initialize PixiJS application
  useEffect(() => {
    // Wait for next frame to ensure container is mounted
    const frameId = requestAnimationFrame(() => {
      if (!pixiContainerRef.current || initAttemptedRef.current) {
        return;
      }

      initAttemptedRef.current = true;
      console.log("Starting PixiJS initialization...");

      // Create PixiJS application
      const app = new PIXI.Application({
        width: pixiContainerRef.current.clientWidth,
        height: pixiContainerRef.current.clientHeight,
        backgroundColor: 0x1a1a1a,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        resizeTo: pixiContainerRef.current,
      });

      // Add the canvas to the container
      pixiContainerRef.current.appendChild(app.view as HTMLCanvasElement);

      // Store the application reference
      appRef.current = app;

      // Create game container with scaling
      const gameContainer = new PIXI.Container();
      const scale = Math.min(
        app.screen.width / (MineMap.width * MineMap.tilewidth),
        app.screen.height / (MineMap.height * MineMap.tileheight)
      );
      gameContainer.scale.set(scale);
      gameContainer.x =
        (app.screen.width - MineMap.width * MineMap.tilewidth * scale) / 2;
      gameContainer.y =
        (app.screen.height - MineMap.height * MineMap.tileheight * scale) / 2;
      app.stage.addChild(gameContainer);

      // Load sprites and initialize the game
      const initializeGame = async () => {
        try {
          // Preload sprites with progress tracking
          console.log("Preloading sprites...");
          await preloadSprites((progress) => {
            console.log(`Sprite loading progress: ${progress}%`);
            setLoadingProgress(Math.min(90, 5 + progress * 0.85));
          });

          // Render map layers
          console.log("Rendering map layers...");
          await renderMapLayers(app, gameContainer);

          // Add interactive elements
          console.log("Setting up interactivity...");
          setupInteractivity(app, gameContainer);

          // Start the game loop
          app.ticker.add(() => {
            updateGame(app, gameContainer);
          });

          // Mark initialization as complete
          console.log("Initialization complete!");
          initCompletedRef.current = true;
          setLoadingProgress(100);
          setTimeout(() => setLoading(false), 500);
        } catch (error) {
          console.error("Failed to initialize game:", error);
          setLoadingError(
            "Failed to initialize game. Using fallback renderer."
          );
          setLoadingProgress(100);
          setTimeout(() => setLoading(false), 500);
        }
      };

      initializeGame();

      // Handle window resize
      const handleResize = () => {
        if (!pixiContainerRef.current) return;
        app.renderer.resize(
          pixiContainerRef.current.clientWidth,
          pixiContainerRef.current.clientHeight
        );
      };

      window.addEventListener("resize", handleResize);

      // Cleanup function
      return () => {
        window.removeEventListener("resize", handleResize);
        app.destroy(true, { children: true, texture: true, baseTexture: true });
      };
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [setupInteractivity, updateGame, renderMapLayers]);

  // Render loading screen
  if (loading) {
    return (
      <div className="pixel-container glass-panel relative w-full h-full rounded-lg overflow-hidden animate-fade-in shadow-xl border border-white/10 flex flex-col items-center justify-center gap-4">
        <div className="text-center">
          <h3 className="text-xl font-bold text-white mb-2">
            Loading Mining Area
          </h3>
          <p className="text-white mb-2">
            {loadingProgress < 30
              ? "Initializing PixiJS..."
              : loadingProgress < 60
              ? "Loading game assets..."
              : loadingProgress < 90
              ? "Setting up mining environment..."
              : "Finalizing..."}
          </p>
          <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
            <Progress value={loadingProgress} className="h-full" />
          </div>
        </div>
        <p className="text-xs text-gray-400 max-w-xs text-center">
          {loadingError || "Preparing your mining operation..."}
        </p>
        <div className="flex gap-2 mt-4">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse delay-100"></div>
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse delay-200"></div>
        </div>
      </div>
    );
  }

  // Render blackout overlay if needed
  if (isBlackout) {
    return (
      <div className="relative w-full h-full">
        <div ref={pixiContainerRef} className="w-full h-full opacity-50" />
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-500 mb-2">
              BLACKOUT!
            </div>
            <div className="text-sm text-white/70 mb-4">
              Energy levels critical
            </div>
            <div className="text-sm text-white/50">All operations frozen</div>
          </div>
        </div>
      </div>
    );
  }

  // Render the PixiJS container
  return <div ref={pixiContainerRef} className="w-full h-full" />;
};
