import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Address } from "viem";

export type Routes = {
  Home: undefined;
  Create: undefined;
  Circle: { address: Address };
  Bid: { address: Address; round: number };
  Join: { link: string };
  Paste: undefined;
  Me: undefined;
};

export type ScreenProps<K extends keyof Routes> = NativeStackScreenProps<Routes, K>;
