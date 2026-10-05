// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { IKittyRecord } from "../../src/interfaces/IKittyRecord.sol";

/// @notice A record where everyone is Family: one-month deposit, the circle's
/// own holdback, offers in any round, payout by seat. Under it a circle runs
/// exactly as SRS 7.7 did before standing, so the suites written against those
/// economics (TV-1..TV-6) keep testing them unchanged.
contract OpenRecord is IKittyRecord {
    function joined(address) external { }
    function left(address) external { }
    function missed(address) external { }
    function arrearsCleared(address) external { }
    function defaulted(address, uint256) external { }
    function repaid(address, uint256) external { }
    function finished(address, uint64, bool, uint8, uint8, address[] calldata, Stage[] calldata) external { }
    function forgive(address) external { }
    function addFactory(address) external { }

    function isFactory(address) external pure returns (bool) {
        return true;
    }

    function stageOf(address) external pure returns (Stage) {
        return Stage.Family;
    }

    function termsOf(address, uint64) external pure returns (Terms memory t) {
        t = Terms(Stage.Family, 100, 255, 0, 255, 0);
    }

    function debtOf(address) external pure returns (uint256) {
        return 0;
    }

    function owedIn(address) external pure returns (address[] memory) {
        return new address[](0);
    }

    function hasMet(address, address) external pure returns (bool) {
        return false;
    }

    function progressOf(address) external pure returns (int256, uint16, uint16, uint64, uint8) {
        return (0, 0, 0, 0, 0);
    }
}
