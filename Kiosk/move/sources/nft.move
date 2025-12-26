/// 簡易 NFT 模組 - 用於 Kiosk 測試
/// 
/// 這個模組提供基本的 NFT 功能：
/// - mint: 鑄造新的 NFT
/// - burn: 銷毀 NFT
/// - transfer: 轉移 NFT
module simple_kiosk::nft {
    use std::string::{Self, String};
    use sui::event;

    /// NFT 物件
    public struct NFT has key, store {
        id: UID,
        /// NFT 名稱
        name: String,
        /// NFT 描述
        description: String,
        /// 圖片 URL
        image_url: String,
    }

    /// 鑄造事件
    public struct NFTMinted has copy, drop {
        nft_id: ID,
        name: String,
        creator: address,
    }

    /// 銷毀事件
    public struct NFTBurned has copy, drop {
        nft_id: ID,
    }

    /// 鑄造新的 NFT
    public entry fun mint(
        name: vector<u8>,
        description: vector<u8>,
        image_url: vector<u8>,
        ctx: &mut TxContext
    ) {
        let nft = NFT {
            id: object::new(ctx),
            name: string::utf8(name),
            description: string::utf8(description),
            image_url: string::utf8(image_url),
        };

        let sender = tx_context::sender(ctx);

        event::emit(NFTMinted {
            nft_id: object::id(&nft),
            name: nft.name,
            creator: sender,
        });

        transfer::public_transfer(nft, sender);
    }

    /// 鑄造並轉移給指定地址
    public entry fun mint_to(
        name: vector<u8>,
        description: vector<u8>,
        image_url: vector<u8>,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let nft = NFT {
            id: object::new(ctx),
            name: string::utf8(name),
            description: string::utf8(description),
            image_url: string::utf8(image_url),
        };

        event::emit(NFTMinted {
            nft_id: object::id(&nft),
            name: nft.name,
            creator: tx_context::sender(ctx),
        });

        transfer::public_transfer(nft, recipient);
    }

    /// 銷毀 NFT
    public entry fun burn(nft: NFT) {
        let NFT { id, name: _, description: _, image_url: _ } = nft;

        event::emit(NFTBurned {
            nft_id: id.to_inner(),
        });

        object::delete(id);
    }

    /// 轉移 NFT
    public entry fun transfer_nft(nft: NFT, recipient: address) {
        transfer::public_transfer(nft, recipient);
    }

    // ===== Getter 函數 =====

    /// 取得 NFT 名稱
    public fun name(nft: &NFT): &String {
        &nft.name
    }

    /// 取得 NFT 描述
    public fun description(nft: &NFT): &String {
        &nft.description
    }

    /// 取得 NFT 圖片 URL
    public fun image_url(nft: &NFT): &String {
        &nft.image_url
    }
}
