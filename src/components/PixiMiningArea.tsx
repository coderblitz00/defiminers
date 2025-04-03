import { Progress } from "@/components/ui/progress";
import { MapTile, MineMap } from "@/constants/Map";
import { MineTypes } from "@/constants/Mine";
import { useGameUpdate } from "@/hooks/useGameUpdate";
import { Miner } from "@/interfaces/MinerTypes";
import { Ore } from "@/interfaces/OreTypes";
import { renderMapLayers } from "@/lib/mapLogic";
import { preloadSprites } from "@/utils/spriteLoader";
import * as PIXI from "pixi.js";
import { useCallback, useEffect, useRef, useState } from "react";

interface PixiMiningAreaProps {
  miners: Miner[];
  ores: Ore[];
  activeMine?: string;
  onOreClick?: (ore: Ore, tileCountX: number, tileCountY: number) => void;
  onBaseClick?: () => void;
  isBlackout?: boolean;
}

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
  const [tileCounts, setTileCounts] = useState({ x: 0, y: 0 });

  // Flag to track if initialization has been attempted and completed
  const initAttemptedRef = useRef(false);
  const initCompletedRef = useRef(false);

  // Memoize game status hook
  useGameUpdate({
    appRef,
    miners,
    ores,
    tileCountX: tileCounts.x,
    tileCountY: tileCounts.y,
  });

  // Optimize loading progress simulation
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

  // Optimize PixiJS initialization
  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      if (
        !pixiContainerRef.current ||
        initAttemptedRef.current ||
        loadingProgress < 90
      ) {
        return;
      }

      initAttemptedRef.current = true;
      console.log("Starting PixiJS initialization...");

      // Create PixiJS application with optimized settings
      const app = new PIXI.Application({
        width: pixiContainerRef.current.clientWidth,
        height: pixiContainerRef.current.clientHeight,
        backgroundColor: 0x1a1a1a,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        resizeTo: pixiContainerRef.current,
        powerPreference: "high-performance",
        antialias: false,
        hello: true,
      });

      // Add the canvas to the container
      pixiContainerRef.current.appendChild(app.view as HTMLCanvasElement);

      // Store the application reference
      appRef.current = app;

      const tileCountX = Math.floor(app.screen.width / MapTile.width);
      const tileCountY = Math.floor(app.screen.height / MapTile.height);
      setTileCounts({ x: tileCountX, y: tileCountY });
      console.log({ tileCountX, tileCountY });

      // Create game container with optimized scaling
      const gameContainer = new PIXI.Container();
      gameContainer.x = (app.screen.width - tileCountX * MapTile.width) / 2;
      gameContainer.y = (app.screen.height - tileCountY * MapTile.height) / 2;
      app.stage.addChild(gameContainer);

      // Optimize sprite loading and game initialization
      const initializeGame = async () => {
        try {
          // Preload sprites with progress tracking
          console.log("Preloading sprites...");
          await preloadSprites((progress) => {
            setLoadingProgress(Math.min(90, 5 + progress * 0.85));
          });

          // Render map layers
          console.log("Rendering map layers...");
          await renderMapLayers(
            app,
            gameContainer,
            miners,
            ores,
            activeMine,
            tileCountX,
            tileCountY,
            onOreClick,
            isBlackout
          );

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

      // Optimize window resize handler
      const handleResize = () => {
        if (!pixiContainerRef.current) return;
        app.renderer.resize(
          pixiContainerRef.current.clientWidth,
          pixiContainerRef.current.clientHeight
        );
      };

      window.addEventListener("resize", handleResize);

      // Optimize cleanup
      return () => {
        window.removeEventListener("resize", handleResize);
        app.destroy(true, { children: true, texture: true, baseTexture: true });
      };
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [loadingProgress, activeMine, ores, isBlackout, miners, onOreClick]);

  // Memoize loading screen render
  const renderLoadingScreen = useCallback(() => {
    if (!loading) return null;

    return (
      <div className="absolute inset-0 pixel-container glass-panel rounded-lg overflow-hidden animate-fade-in shadow-xl border border-white/10 flex flex-col items-center justify-center gap-4">
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
  }, [loading, loadingProgress, loadingError]);

  // Memoize blackout overlay render
  const renderBlackoutOverlay = useCallback(() => {
    if (!isBlackout) return null;

    return (
      <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold text-red-500 mb-2">BLACKOUT!</div>
          <div className="text-sm text-white/70 mb-4">
            Energy levels critical
          </div>
          <div className="text-sm text-white/50">All operations frozen</div>
        </div>
      </div>
    );
  }, [isBlackout]);

  return (
    <div className="relative w-full h-full">
      <div ref={pixiContainerRef} className="w-full h-full" />
      {renderLoadingScreen()}
      {renderBlackoutOverlay()}
    </div>
  );
};
