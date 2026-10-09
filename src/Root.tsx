import { Composition } from "remotion";
import { videos } from "./compositions";

// كل <Composition> = فيديو مستقل. القايمة نفسها متعرفة في compositions.ts
export const RemotionRoot: React.FC = () => {
  return (
    <>
      {videos.map((v) => (
        <Composition
          key={v.id}
          id={v.id}
          component={v.component}
          durationInFrames={v.durationInFrames}
          fps={v.fps}
          width={v.width}
          height={v.height}
          defaultProps={v.defaultProps}
          // calculateMetadata = الطول والمقاس بيتحسبوا من الـ props وقت التصدير
          calculateMetadata={v.calculate ? ({ props }) => v.calculate!(props) : undefined}
        />
      ))}
    </>
  );
};
