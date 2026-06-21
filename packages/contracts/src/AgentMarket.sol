// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AgentMarket — list, buy, and sell iWORLD agents (AgentNFT).
/// @notice Escrow marketplace: a seller lists their agent (the token is held here),
/// a buyer pays the price, the token moves to the buyer, the seller is paid minus a
/// small marketplace fee. Ownership of the agent transfers on-chain.
///
/// ⚠️ TESTNET DEMO. On mainnet (real value) this is regulated territory — securities /
/// money-transmission — and must not ship without legal review. Also: this v1 moves the
/// ownership token; the full ERC-7857 re-keyed brain transfer (re-encrypting the agent's
/// encrypted memory to the buyer via a TEE oracle) is the deeper step.
contract AgentMarket is Ownable, ReentrancyGuard {
    IERC721 public immutable nft;
    uint96 public feeBps; // marketplace fee in basis points (100 = 1%)

    struct Listing {
        address seller;
        uint256 price;
    }

    mapping(uint256 => Listing) public listings;

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Cancelled(uint256 indexed tokenId, address indexed seller);
    event Bought(uint256 indexed tokenId, address indexed buyer, address indexed seller, uint256 price);

    constructor(address nftAddress, uint96 feeBps_, address initialOwner) Ownable(initialOwner) {
        require(nftAddress != address(0), "zero nft");
        require(feeBps_ <= 1000, "fee too high");
        nft = IERC721(nftAddress);
        feeBps = feeBps_;
    }

    /// @notice List an agent for sale. Caller must approve this market for the token first.
    function list(uint256 tokenId, uint256 price) external nonReentrant {
        require(price > 0, "price = 0");
        require(nft.ownerOf(tokenId) == msg.sender, "not owner");
        listings[tokenId] = Listing(msg.sender, price);
        nft.transferFrom(msg.sender, address(this), tokenId); // escrow
        emit Listed(tokenId, msg.sender, price);
    }

    /// @notice Cancel a listing and return the agent to the seller.
    function cancel(uint256 tokenId) external nonReentrant {
        Listing memory l = listings[tokenId];
        require(l.seller == msg.sender, "not seller");
        delete listings[tokenId];
        nft.transferFrom(address(this), msg.sender, tokenId);
        emit Cancelled(tokenId, msg.sender);
    }

    /// @notice Buy a listed agent. Pays the seller (minus fee) and moves the token to the buyer.
    function buy(uint256 tokenId) external payable nonReentrant {
        Listing memory l = listings[tokenId];
        require(l.price > 0, "not listed");
        require(msg.value >= l.price, "underpaid");
        delete listings[tokenId];

        uint256 fee = (l.price * feeBps) / 10000;
        nft.transferFrom(address(this), msg.sender, tokenId);
        (bool okSeller, ) = payable(l.seller).call{value: l.price - fee}("");
        require(okSeller, "seller pay failed");
        if (msg.value > l.price) {
            (bool okRefund, ) = payable(msg.sender).call{value: msg.value - l.price}("");
            require(okRefund, "refund failed");
        }
        emit Bought(tokenId, msg.sender, l.seller, l.price);
    }

    function isListed(uint256 tokenId) external view returns (bool) {
        return listings[tokenId].price > 0;
    }

    function setFee(uint96 bps) external onlyOwner {
        require(bps <= 1000, "max 10%");
        feeBps = bps;
    }

    function withdraw(address payable to) external onlyOwner {
        (bool ok, ) = to.call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }
}
