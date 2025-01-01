'use client'

import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

export const WalletButton = () => {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const handleClick = () => {
    if (connected) {
      disconnect();
    } else {
      setVisible(true);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="text-white hover:text-gray-300 text-base"
    >
      {connected && publicKey 
        ? `[${publicKey.toString().slice(0, 4)}...]`
        : '[connect wallet]'
      }
    </button>
  );
};
