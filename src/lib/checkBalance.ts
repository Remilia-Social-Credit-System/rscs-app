import { ethers } from 'ethers';

/**
 * @author Ozzy(@Zerocousin) for Remilia Social Credit System
 * Check Balance is a function that checks the balance of the user in the collections
 * and returns the highest weight of the collection that the user has a balance in.
 */

const collections = [
  { name: 'Bonkler', weight: 10, address: '0xABFaE8A54e6817F57F9De7796044E9a60e61ad67' },
  { name: 'Milady Maker NFT', weight: 7, address: '0x5af0d9827e0c53e4799bb226655a1de152a425a5' },
  { name: 'Redacted Remilio Babies', weight: 5, address: '0xd3d9ddd0cf0a5f0bfb8f7fceae075df687eaebab' },
  { name: 'Schizoposters', weight: 4, address: '0xbfe47d6d4090940d1c7a0066b63d23875e3e2ac5' },
  { name: 'YAYO', weight: 3, address: '0x09f66a094a0070ebddefa192a33fa5d75b59d46b' },
  { name: 'Radbro Webring V2', weight: 2, address: '0xabcdb5710b88f456fed1e99025379e2969f29610' },
  { name: 'Pixelady Maker', weight: 2, address: '0x8fc0d90f2c45a5e7f94904075c952e0943cfccfd' },
  { name: 'Milady Fumo Babies', weight: 2, address: '0x773ac90d0c605ec3beb49a0a971240400319e577' },
  { name: 'Kagami Academy', weight: 2, address: '0x4cc2c3518b1a5b782fa6c5bde80b7388fd8c674f' },
  { name: 'Radbro Webring: Radcats', weight: 1, address: '0x3bfc3134645ebe0393f90d6a19bcb20bd732964f' },
];

// Checks Eligibility for Voting
export async function checkVotingEligibility(address: string): Promise<number> {
  const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_INFURA_URL || '');
  let highestWeight = 0;

  const balanceABI = ['function balanceOf(address owner) view returns (uint256)'];

  for (const collection of collections) {
    const contract = new ethers.Contract(collection.address, balanceABI, provider);
    const balance = await contract.balanceOf(address);
    if (ethers.getBigInt(balance) > ethers.getBigInt(0)) {
      highestWeight = Math.max(highestWeight, collection.weight);
    }
  }

  return highestWeight;
}

// Milady OG Check
const MILADY_CONTRACT = '0x5af0d9827e0c53e4799bb226655a1de152a425a5';
const OG_CUTOFF_DATE = new Date('2022-05-23T05:04:00Z').getTime() / 1000; // Convert to Unix timestamp

export async function checkMiladyOGStatus(address: string): Promise<boolean> {
  const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_INFURA_URL || '');
  
  const contract = new ethers.Contract(MILADY_CONTRACT, ['event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'], provider);

  // Get all Transfer events to this address
  const filter = contract.filters.Transfer(null, address);
  const events = await contract.queryFilter(filter, 0, 'latest');

  // Check if any transfer occurred before the cutoff date
  for (const event of events) {
    const block = await event.getBlock();
    if (block.timestamp < OG_CUTOFF_DATE) {
      return true;
    }
  }

  return false;
}