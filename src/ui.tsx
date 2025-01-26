import "!prismjs/themes/prism.css";

import {
  Button,
  Checkbox,
  Container,
  Divider,
  Dropdown,
  Muted,
  render,
  Text,
  TextboxNumeric,
  VerticalSpace,
} from "@create-figma-plugin/ui";
import { emit } from "@create-figma-plugin/utilities";
import { h } from "preact";
import { useState } from "preact/hooks";
import { useCallback, useEffect } from "react";
import {
  GetPreviewHandler,
  PaintImageHandler,
  SubmitNumberHandler,
} from "./types";
import { decode, encode } from "./lib/imageProcessingUtils";

// Helper function to create a worker from a function
function createWorker(fn: Function) {
  const blob = new Blob([`(${fn.toString()})()`], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  return new Worker(url);
}

function Plugin() {
  const [number, setNumber] = useState("10");
  const [fibWebWorker, setFibWebWorker] = useState<Worker | null>(null);
  const [usefibWorker, setUseFibWorker] = useState<boolean>(false);
  const [imageProcessingWebWorker, setImageProcessingWebWorker] =
    useState<Worker | null>(null);
  const [filterOption, setFilterOption] = useState<string>("Warm");

  // Initialize workers
  useEffect(() => {
    // Create Fibonacci worker
    const fibWorkerCode = () => {
      self.onmessage = (message: any) => {
        const { number } = message.data;
        const fib = (n: number): number =>
          n < 2 ? n : fib(n - 1) + fib(n - 2);
        const start = performance.now();
        const fibNum = fib(number);
        const timeTaken = performance.now() - start;
        self.postMessage({ fibNum, timeTaken });
      };
    };

    // Create Image Processing worker
    const imageWorkerCode = () => {
      self.onmessage = async (message: any) => {
        const data = message.data;

        function applyGrayFilter(image: any) {
          for (let i = 0; i <= image.data.length; i += 4) {
            image.data[i] =
              image.data[i + 1] =
              image.data[i + 2] =
                parseInt(
                  image.data[i] * 0.21 +
                    image.data[i + 1] * 0.71 +
                    image.data[i + 2] * 0.07,
                  10
                );
          }
          return image;
        }

        function applyWarmFilter(imageData: any) {
          for (let i = 0; i < imageData.data.length; i += 4) {
            const red = imageData.data[i];
            const green = imageData.data[i + 1];
            const blue = imageData.data[i + 2];

            imageData.data[i] = Math.min(255, red + 30);
            imageData.data[i + 1] = Math.min(255, green + 10);

            const brightness = (red + green + blue) / 3;
            imageData.data[i] = Math.min(
              255,
              imageData.data[i] + (brightness / 128) * 20
            );
            imageData.data[i + 1] = Math.min(
              255,
              imageData.data[i + 1] + (brightness / 128) * 10
            );
            imageData.data[i + 2] = Math.min(
              255,
              imageData.data[i + 2] + (brightness / 128) * 5
            );
          }
        }

        function applyCoolFilter(imageData: any) {
          for (let i = 0; i < imageData.data.length; i += 4) {
            const red = imageData.data[i];
            const green = imageData.data[i + 1];
            const blue = imageData.data[i + 2];

            imageData.data[i] = Math.max(0, red - 10);
            imageData.data[i + 1] = Math.max(0, green - 10);

            const brightness = (red + green + blue) / 3;
            imageData.data[i] = Math.max(
              0,
              imageData.data[i] - (brightness / 128) * 20
            );
            imageData.data[i + 1] = Math.max(
              0,
              imageData.data[i + 1] - (brightness / 128) * 10
            );
            imageData.data[i + 2] = Math.max(
              0,
              imageData.data[i + 2] - (brightness / 128) * 5
            );
          }
        }

        function applyCozyFilter(imageData: any) {
          const brightness = 1;
          const saturation = 0.8;
          const contrast = 0.8;

          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] *= brightness;
            imageData.data[i + 1] *= brightness;
            imageData.data[i + 2] *= brightness;

            const grayValue =
              (imageData.data[i] +
                imageData.data[i + 1] +
                imageData.data[i + 2]) /
              3;
            imageData.data[i] =
              imageData.data[i] * saturation + grayValue * (1 - saturation);
            imageData.data[i + 1] =
              imageData.data[i + 1] * saturation + grayValue * (1 - saturation);
            imageData.data[i + 2] =
              imageData.data[i + 2] * saturation + grayValue * (1 - saturation);

            imageData.data[i] = (imageData.data[i] - 128) * contrast + 128;
            imageData.data[i + 1] =
              (imageData.data[i + 1] - 128) * contrast + 128;
            imageData.data[i + 2] =
              (imageData.data[i + 2] - 128) * contrast + 128;
          }
        }

        function fuzzFilter(
          imageData: any,
          width: number,
          height: number,
          amount: number
        ) {
          const data = imageData.data;
          const fuzzyPixels = 2;
          const modC = 4 * fuzzyPixels;
          const modW = 4 * width * 1;

          for (let i = 0; i < data.length; i += 4) {
            const f = modC + modW;
            const grainAmount = Math.random() * 2 * amount - amount;

            if (data[i + f]) {
              data[i] = Math.round((data[i] + data[i + f]) / 2);
              data[i + 1] = Math.round((data[i + 1] + data[i + f + 1]) / 2);
              data[i + 2] = Math.round((data[i + 2] + data[i + f + 2]) / 2);
            }

            data[i] += grainAmount;
            data[i + 1] += grainAmount;
            data[i + 2] += grainAmount;
          }
        }

        const start = performance.now();

        switch (data.processing.option) {
          case "Warm":
            applyWarmFilter(data.image.data);
            break;
          case "Cool":
            applyCoolFilter(data.image.data);
            break;
          case "Cozy":
            applyCozyFilter(data.image.data);
            break;
          case "B&W":
            applyGrayFilter(data.image.data);
            break;
        }

        fuzzFilter(data.image.data, data.image.width, data.image.height, 30);

        const timeTaken = performance.now() - start;

        self.postMessage({
          processedPreviewImageBytes: data,
          timeTaken,
        });
      };
    };

    try {
      const fibWorker = createWorker(fibWorkerCode);
      const imageWorker = createWorker(imageWorkerCode);

      setFibWebWorker(fibWorker);
      setImageProcessingWebWorker(imageWorker);

      return () => {
        fibWorker.terminate();
        imageWorker.terminate();
      };
    } catch (error) {
      console.error("Failed to initialize workers:", error);
    }
  }, []);

  const handleSubmitButtonClick = () => {
    const num = parseInt(number, 10);

    const logResult = (
      num: number,
      fibNum: number,
      timeTaken: number,
      type: string
    ) => {
      console.log(
        `Fib(${num})=${fibNum} (${parseFloat(`${timeTaken}`).toFixed(
          2
        )} ms, ${type} thread)`
      );
    };

    if (usefibWorker && fibWebWorker) {
      fibWebWorker.postMessage({ number: num });
      fibWebWorker.onmessage = (e: MessageEvent) => {
        const { timeTaken, fibNum } = e.data;
        logResult(num, fibNum, timeTaken, "background");
        emit<SubmitNumberHandler>("SUBMIT_NUM", `${fibNum}`);
      };
    } else {
      const fib = (n: number): number => (n < 2 ? n : fib(n - 1) + fib(n - 2));
      const start = performance.now();
      const fibNum = fib(num);
      const timeTaken = performance.now() - start;
      logResult(num, fibNum, timeTaken, "main");
      emit<SubmitNumberHandler>("SUBMIT_NUM", `${fibNum}`);
    }
  };

  const handleImageProcessing = () => {
    emit<GetPreviewHandler>("GET_PREVIEW");
  };

  const imageProcessing = useCallback(
    async (imageBytes: any) => {
      if (!imageProcessingWebWorker) return;

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const imageDetails = await decode(canvas, ctx, imageBytes);
      const preset = {
        image: {
          data: imageDetails.imageData,
          width: imageDetails.width,
          height: imageDetails.height,
        },
        processing: {
          option: filterOption,
        },
      };

      imageProcessingWebWorker.onmessage = async (e: MessageEvent) => {
        const { processedPreviewImageBytes, timeTaken } = e.data;
        const newBytes = await encode(
          canvas,
          ctx,
          processedPreviewImageBytes.image.data
        );
        console.log(
          `Image processed (${parseFloat(`${timeTaken}`).toFixed(2)} ms)`
        );
        emit<PaintImageHandler>("PAINT_IMAGE", { imageBytes: newBytes });
      };

      imageProcessingWebWorker.postMessage(preset);
    },
    [imageProcessingWebWorker, filterOption]
  );

  useEffect(() => {
    onmessage = event => {
      const { type } = event.data.pluginMessage;
      if (type === "get-node-image-bytes") {
        const imageBytes = event.data.pluginMessage.imageBytes;
        imageProcessing(imageBytes);
      }
    };
  }, [imageProcessing]);

  return (
    <Container space="medium">
      <VerticalSpace space="large" />
      <Text>🔢 Example 1: Fib number</Text>
      <VerticalSpace space="small" />
      <Text>
        <Muted>
          Get a Fibonacci number by entering the index (try 42 or 43)
        </Muted>
      </Text>
      <VerticalSpace space="large" />
      <TextboxNumeric
        onInput={event => setNumber(event.currentTarget.value)}
        value={`${number}`}
        variant="border"
      />
      <VerticalSpace space="small" />
      <Button fullWidth onClick={handleSubmitButtonClick}>
        Get Fibonacci number
      </Button>
      <VerticalSpace space="small" />
      <Checkbox
        onChange={event => setUseFibWorker(event.currentTarget.checked)}
        value={usefibWorker}>
        <Text>use web worker</Text>
      </Checkbox>
      <VerticalSpace space="small" />
      <Divider />

      <VerticalSpace space="large" />
      <Text>📸 Example 2: Image processing</Text>
      <VerticalSpace space="small" />
      <Text>
        <Muted>Apply a filter on top of the selected image</Muted>
      </Text>
      <VerticalSpace space="small" />
      <Dropdown
        onChange={event => {
          setFilterOption(event.currentTarget.value);
        }}
        options={[
          { value: "Warm" },
          { value: "Cool" },
          { value: "Cozy" },
          { value: "B&W" },
        ]}
        value={filterOption}
        variant="border"
      />
      <VerticalSpace space="large" />
      <Button fullWidth onClick={handleImageProcessing}>
        Image processing
      </Button>
      <VerticalSpace space="small" />
    </Container>
  );
}

export default render(Plugin);
