// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

/// @notice One standing record per account, written only by Kitty circles
/// ("Feed the Kitty", FR-TRU-13..19). Holds no money and calls no token.
interface IKittyRecord {
    // SRS names: Owing, Rebuilding, Newcomer, Steady, Trusted, Anchor
    enum Stage {
        Away,
        Wary,
        Shy,
        Friendly,
        AtHome,
        Family
    }

    // Why a stage changed, for StageChanged
    enum Why {
        Joined,
        Missed,
        Defaulted,
        Repaid,
        Finished,
        Forgiven,
        Left
    }

    /// A circle's terms for one member, fixed when they join.
    struct Terms {
        Stage stage; // after the size rule (FR-TRU-16)
        uint16 depositX100; // multiple of the circle's own deposit: 200 for Wary, else 100
        uint8 limitMonths; // most owed after the pot beyond the deposit, in rounds; 255 = the circle's rule
        uint8 offerFrom; // 0 any round, 1 second half only, 2 never
        uint8 maxOpen; // circles at once
        uint8 open; // circles open now
    }

    error NotCircle();
    error NotOwner();
    error AlreadyAdded();
    error NothingToForgive();

    // Writes, only from circles of a registered factory.
    function joined(address m) external;
    function left(address m) external;
    function missed(address m) external;
    function arrearsCleared(address m) external;
    function defaulted(address m, uint256 shortfall) external; // also closes that circle for m
    function repaid(address m, uint256 amount) external;
    function finished(
        address m,
        uint64 contribution,
        bool clean,
        uint8 onTime,
        uint8 rounds,
        uint8 people,
        uint8 points
    ) external;

    // Reads. Healing and fading are worked out from the clock.
    function stageOf(address a) external view returns (Stage);
    function termsOf(address a, uint64 contribution) external view returns (Terms memory);
    function debtOf(address a) external view returns (uint256);
    function progressOf(address a)
        external
        view
        returns (int256 points, uint16 onTimeBps, uint16 people, uint64 biggestClean, uint8 open);

    // The only admin powers (FR-TRU-19).
    function forgive(address m) external;
    function addFactory(address factory) external;
    function isFactory(address factory) external view returns (bool);

    event StageChanged(address indexed account, Stage from, Stage to, Why why);
    event DebtChanged(address indexed account, uint256 debt);
    event FactoryAdded(address indexed factory, uint64 countsFrom);
}
