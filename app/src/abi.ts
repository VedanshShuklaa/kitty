import { parseAbi } from "viem";

// Only what the app calls. Signatures mirror contracts/src/interfaces.
const RULES =
  "struct Rules { uint8 memberCount; uint16 stakeBps; uint16 maxBidBps; uint16 poolShareBps; uint16 holdbackBps; bool yieldOn; uint64 contribution; uint64 firstDue; uint32 period; uint32 commitWindow; uint32 revealWindow; uint32 grace; uint64 joinDeadline; }";

export const factoryAbi = parseAbi([
  RULES,
  "function createCircle(Rules rules, address[] inviteSigners) returns (address)",
  "function predictCircle(address organizer) view returns (address)",
  "function minPeriod() view returns (uint32)",
  "error BadRules()",
]);

export const circleAbi = parseAbi([
  RULES,
  "function join(uint8 seat, bytes inviteSig)",
  "function cancel()",
  "function contribute(uint32 round)",
  "function payArrears()",
  "function commitBid(uint32 round, bytes32 commitment)",
  "function revealBid(uint32 round, uint16 discountBps, bytes32 salt)",
  "function closeRound(uint32 round)",
  "function withdraw()",
  "function rules() view returns (Rules)",
  "function state() view returns (uint8)",
  "function currentRound() view returns (uint32)",
  "function dueTime(uint32 round) view returns (uint64)",
  "function amountDue(address member, uint32 round) view returns (uint256 pay, uint256 creditUsed, uint256 holdbackReleased)",
  "function standingOf(address member) view returns (uint8 standing, bool received, uint256 arrears, uint256 credit)",
  "function memberAt(uint8 seat) view returns (address)",
  "function organizer() view returns (address)",
  "function pot() view returns (uint256)",
  "function commitmentOf(uint32 round, address member) view returns (bytes32)",
  "function withdrawable(address member) view returns (uint256)",
  "function paidRound(uint32 round, address member) view returns (bool)",
  "function recipientOf(uint32 round) view returns (address)",
  "function revealedBid(uint32 round, address member) view returns (bool revealed, uint16 discountBps)",
  "function vault() view returns (address)",
  "error WrongState()",
  "error NotMember()",
  "error SeatTaken()",
  "error BadInvite()",
  "error JoinClosed()",
  "error WrongRound()",
  "error TooEarly()",
  "error TooLate()",
  "error AlreadyPaid()",
  "error NotEligible()",
  "error BiddingOff()",
  "error BidTooHigh()",
  "error BadReveal()",
  "error AutopayOff()",
  "error NothingToWithdraw()",
]);

// SRS 15.7: how much of a circle's collateral is earning, and what it has
// earned. Circles from before the yield vault have no such view.
export const vaultAbi = parseAbi([
  "function positionOf(address circle) view returns (uint256 principal, uint256 liquid, uint256 invested, bool earning)",
  "function previewSettle(address circle) view returns (uint256 assets, uint256 principal)",
]);

export const ausdAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function nonces(address owner) view returns (uint256)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
]);

// Agora Instant Settlement (SRS 15.3). On testnet the pair is CTK/AUSD at a
// fixed 1:1 price; CTK stands in for the USDC the mainnet pair settles to.
export const pairAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])",
  "function hasRole(string role, address account) view returns (bool)",
  "function isPaused() view returns (bool)",
  "error Expired()",
  "error InsufficientOutputAmount()",
  "error PairIsPaused()",
]);

export const whitelisterAbi = parseAbi(["function setApprovedSwapper(address swapper)"]);

// Agora's testnet faucet: 10,000 AUSD per request, behind a short cooldown.
export const faucetAbi = parseAbi(["function requestFunds(address to)", "error MaxFrequencyExceeded()"]);
