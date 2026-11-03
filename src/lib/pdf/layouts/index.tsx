import React from "react";
import { EditorialBrief, EditorialCv } from "./editorial";
import { KlassischBrief, KlassischCv } from "./klassisch";
import { MinimalBrief, MinimalCv } from "./minimal";
import { SeitenleisteBrief, SeitenleisteCv } from "./seitenleiste";
import { ZeitleisteBrief, ZeitleisteCv } from "./zeitleiste";
import type { LayoutId, LayoutOptionen, UnterlagenBrief, UnterlagenCv } from "./typen";

export * from "./typen";
export { registriereSchriften } from "./schriften";

type CvKomp = (p: { cv: UnterlagenCv; o: LayoutOptionen }) => React.ReactElement;
type BriefKomp = (p: { cv: UnterlagenCv; brief: UnterlagenBrief; o: LayoutOptionen }) => React.ReactElement;

const KOMPONENTEN: Record<LayoutId, { cv: CvKomp; brief: BriefKomp }> = {
  editorial: { cv: EditorialCv, brief: EditorialBrief },
  klassisch: { cv: KlassischCv, brief: KlassischBrief },
  seitenleiste: { cv: SeitenleisteCv, brief: SeitenleisteBrief },
  zeitleiste: { cv: ZeitleisteCv, brief: ZeitleisteBrief },
  minimal: { cv: MinimalCv, brief: MinimalBrief },
};

export function cvDokument(layout: LayoutId, cv: UnterlagenCv, o: LayoutOptionen) {
  const K = KOMPONENTEN[layout].cv;
  return <K cv={cv} o={o} />;
}

export function briefDokument(layout: LayoutId, cv: UnterlagenCv, brief: UnterlagenBrief, o: LayoutOptionen) {
  const K = KOMPONENTEN[layout].brief;
  return <K cv={cv} brief={brief} o={o} />;
}
