'use client'

import React, { useState, useEffect, useCallback } from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  User,
  Button,
  Input,
  Pagination,
  Modal,
  Select,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  SelectItem,
  Chip,
  Spinner,
} from "@nextui-org/react";
import UserStatusBadge from "./UserStatusBadge";
import { CheckBadgeIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import TwitterAuthModal from './TwitterAuthModal';
import { useWalletVoting } from './useWalletVoting';
import { useSearchParams } from 'next/navigation';
import { useAccount, useConnect, useSignMessage, Connector } from 'wagmi';
import { checkVotingEligibility } from '../lib/checkBalance';
import useSWR from 'swr';
import { injected } from "@wagmi/core";

// Define UserData interface here instead of importing from InitialUserData
interface UserData {
  username: string;
  display_name: string;
  pfp_url: string;
  followers: string;
  following: string;
  website: string;
  description: string;
  location: string;
  join_date: string;
  birth_date: string;
  score: {
    up: number;
    down: number;
  };
  votes: Array<{
    voter: string;
    weight: number;
    voteType: string;
    timestamp: Date;
  }>;
  status: string;
  isRemiliaOfficial: boolean;
  isMiladyOG: boolean;
  hasGoldenBadge: boolean;
  isClaimed: boolean;
}

// Utility functions
const formatFollowers = (followers: string | number | undefined | null): string => {
  if (followers === undefined || followers === null) {
    return "N/A";
  }

  if (typeof followers === 'string') {
    // Handle pre-formatted strings (e.g., "100K", "1.2M")
    const match = followers.match(/^(\d+(\.\d+)?)([KM])?$/);
    if (match) {
      const [, num, , suffix] = match;
      const value = parseFloat(num);
      if (suffix === 'K') return (value >= 1000 ? (value / 1000).toFixed(1) : value) + 'K';
      if (suffix === 'M') return value + 'M';
      return value.toString();
    }

    followers = parseFloat(followers.replace(/,/g, ''));
  }

  if (isNaN(followers)) {
    return "N/A";
  }

  if (followers >= 1000000) {
    return (followers / 1000000).toFixed(1) + "M";
  }
  if (followers >= 1000) {
    return (followers / 1000).toFixed(1) + "K";
  }
  return followers.toString();
};

const calculateApprovalRate = (likes: number | undefined, dislikes: number | undefined) => {
  const totalVotes = (likes || 0) + (dislikes || 0);
  return totalVotes === 0 ? 0 : ((likes || 0) / totalVotes) * 100;
};

const getStatus = (likes: number | undefined, dislikes: number | undefined) => {
  const approvalRate = calculateApprovalRate(likes || 0, dislikes || 0);
  if (approvalRate >= 70) return "Approved";
  if (approvalRate >= 40) return "Moderate";
  return "Risk";
};

const isGoldCheckmarkEligible = (user: UserData) => {
  const totalVotes = (user.score?.up || 0) + (user.score?.down || 0);
  const approvalRate = calculateApprovalRate(user.score?.up || 0, user.score?.down || 0);
  return approvalRate > 90 && totalVotes > 100;
};

const fetcher = (url: string) => fetch(url).then(res => res.json());

const itemsPerPage = 10;

const UserTable: React.FC = () => {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("approvalRateDesc");
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [twitterUsername, setTwitterUsername] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { connect } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const searchParams = useSearchParams();
  const auth = searchParams.get('auth');
  const authError = searchParams.get('error');
  const { data: users, error: fetchError, isLoading: isLoadingUsers, mutate } = useSWR<UserData[]>('/api/users', fetcher, {
    refreshInterval: 5000, // Poll every 5 seconds
    revalidateOnFocus: true,
    dedupingInterval: 2000,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitModalVisible, setIsSubmitModalVisible] = useState(false);
  const [isLoadingModalVisible, setIsLoadingModalVisible] = useState(false);
  const [loadingModalMessage, setLoadingModalMessage] = useState("");
  const [submitModalMessage, setSubmitModalMessage] = useState("");
  const [isLoadingSuccess, setIsLoadingSuccess] = useState(false);
  const { eligible, votingWeight, checkEligibility } = useWalletVoting();
  const { address, isConnected } = useAccount();

  // Handle auth and error messages
  useEffect(() => {
    if (auth === 'success') {
      setSuccessMessage('Account successfully claimed!');
    } else if (authError) {
      setErrorMessage(authError);
    }
  }, [auth, authError]);

  const removeVotes = useCallback(async (username: string) => {
    try {
      const response = await fetch(`/api/users/${username}/removeVotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });

      if (!response.ok) {
        throw new Error('Failed to remove votes');
      }

      await mutate();
    } catch (error) {
      console.error('Error removing votes:', error);
    }
  }, [address, mutate]);

  useEffect(() => {
    if (address && votingWeight === 0) {
      // Remove votes for all users
      const usernames = users?.map(user => user.username) || [];
      for (const username of usernames) {
        removeVotes(username);
      }
    }
  }, [address, votingWeight, users, removeVotes, isConnected]);

  // Filter users based on search input
  const filteredUsers = Array.isArray(users)
    ? users.filter(
      (user: UserData) =>
        (user.display_name?.toLowerCase().includes(search.toLowerCase()) || '') ||
        (user.username?.toLowerCase().includes(search.toLowerCase()) || '')
    )
    : [];

  const parseFollowers = (followers: string): number => {
    if (typeof followers !== 'string') return 0;

    const num = parseFloat(followers.replace(/,/g, ''));
    if (followers.endsWith('K')) {
      return num * 1000;
    }
    if (followers.endsWith('M')) {
      return num * 1000000;
    }
    return num;
  };

  // Sort users based on the selected filter
  const sortUsers = (users: UserData[]) => {
    switch (filter) {
      case "followers":
        return users.sort((a, b) => parseFollowers(b.followers) - parseFollowers(a.followers));
      case "nameAsc":
        return users.sort((a, b) => a.display_name.localeCompare(b.display_name));
      case "nameDesc":
        return users.sort((a, b) => b.display_name.localeCompare(a.display_name));
      case "approvalRateAsc":
        return users.sort(
          (a, b) =>
            calculateApprovalRate(a.score?.up, a.score?.down) -
            calculateApprovalRate(b.score?.up, b.score?.down)
        );
      case "approvalRateDesc":
        return users.sort(
          (a, b) =>
            calculateApprovalRate(b.score?.up, b.score?.down) -
            calculateApprovalRate(a.score?.up, a.score?.down)
        );
      case "statusApproved":
        return users.filter(
          (user) => getStatus(user.score?.up, user.score?.down) === "Approved"
        );
      case "statusModerate":
        return users.filter(
          (user) => getStatus(user.score?.up, user.score?.down) === "Moderate"
        );
      case "statusRisk":
        return users.filter(
          (user) => getStatus(user.score?.up, user.score?.down) === "Risk"
        );
      case "remiliaOfficial":
        return users.filter((user) => user.isRemiliaOfficial);
      case "miladyOG":
        return users.filter((user) => user.isMiladyOG);
      default:
        return users;
    }
  };

  // Sort users based on the selected filter
  const sortedUsers = sortUsers(filteredUsers);

  // Paginate users
  const paginatedUsers = sortedUsers.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  // Check if there are no users after filtering
  const noUsersAvailable = sortedUsers.length === 0;

  // handle vote
  const handleVote = async (username: string, isUpvote: boolean) => {
    console.log('handleVote called', { username, isUpvote, address, votingWeight, isConnected, eligible });

    if (!isConnected) {
      console.log('User is not connected');
      setErrorMessage("Please connect your wallet to vote.");
      return;
    }

    if (!eligible) {
      console.log('User is not eligible to vote');
      setErrorMessage("You are not eligible to vote. Please check your wallet for Remilia Eco NFTs.");
      return;
    }

    if (votingWeight === 0 || votingWeight === null) {
      console.log('User has no voting weight');
      setErrorMessage("Your voting weight is 0. You need Remilia Eco NFTs to vote.");
      return;
    }

    try {
      console.log('Sending vote request');
      const response = await fetch(`/api/users/${username}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isUpvote,
          weight: votingWeight,
          voter: address
        }),
      });

      console.log('Vote response', response);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error response:', errorData);
        throw new Error(errorData.error || 'Failed to vote');
      }

      const { user: updatedUser } = await response.json();
      console.log('Updated user', updatedUser);

      mutate(currentUsers =>
        Array.isArray(currentUsers)
          ? currentUsers.map(user => user.username === username ? updatedUser : user)
          : currentUsers,
        false
      );

      console.log(`Vote recorded: ${isUpvote ? 'up' : 'down'} vote with weight ${votingWeight}`);
      setSuccessMessage(`Vote recorded: ${isUpvote ? 'up' : 'down'} vote with weight ${votingWeight}`);
    } catch (error) {
      console.error('Error voting:', error);
      setErrorMessage("Failed to record vote. Please try again.");
    }
  };

  // Handle thumbs up action
  const handleThumbsUp = async (username: string) => {
    console.log('handleThumbsUp called', username);
    await handleVote(username, true);
  };

  // Handle thumbs down action
  const handleThumbsDown = async (username: string) => {
    console.log('handleThumbsDown called', username);
    await handleVote(username, false);
  };

  // Apply filter and close modal
  const applyFilter = () => {
    setIsFilterModalOpen(false);
  };

  const handleSubmitAccountClick = () => {
    setIsSubmitModalOpen(true);
    setIsSubmitModalVisible(true);
  };

  const isValidUsername = (username: string): boolean => {
    const regex = /^[a-zA-Z0-9_]+$/;
    return regex.test(username);
  };

  const handleSubmitAccount = async () => {
    if (!isValidUsername(twitterUsername)) {
      setSubmitModalMessage("Username can only contain letters, numbers, and underscores.");
      return;
    }

    setIsProcessing(true);
    setSubmitModalMessage("Processing...");
    setIsSubmitModalVisible(true);

    // Close the submit modal after 3 seconds
    setTimeout(() => {
      setIsSubmitModalVisible(false);
      setSubmitModalMessage("");
    }, 3000);

    try {
      setIsLoadingModalVisible(true);
      setLoadingModalMessage("Submitting account...");
      setIsLoadingSuccess(false);

      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: twitterUsername }),
      });

      const data = await response.json();

      if (response.status === 200) {
        setLoadingModalMessage('User already exists in the database');
        setIsLoadingSuccess(false);
      } else if (response.status === 202) {
        setLoadingModalMessage('User creation initiated. Please check back later.');
        setIsLoadingSuccess(true);
      } else {
        throw new Error(data.message || 'Failed to submit account');
      }
    } catch (error: unknown) {
      console.error('Error submitting account:', error);
      setLoadingModalMessage(error instanceof Error ? error.message : 'An unexpected error occurred');
      setIsLoadingSuccess(false);
    } finally {
      setIsProcessing(false);

      // Keep the loading modal visible for 5 seconds after the process completes
      setTimeout(() => {
        setIsLoadingModalVisible(false);
        setLoadingModalMessage("");
        setIsLoadingSuccess(false);
        setIsSubmitModalVisible(false);
      }, 5000);
    }
  };

  // handle claiming accounts
  const handleClaimAccount = async (username: string) => {
    setIsProcessing(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch('/api/auth/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        throw new Error('Failed to initiate OAuth');
      }

      // Handle OAuth initiation success
      const { authUrl } = await response.json();
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error initiating OAuth:', error);
      setErrorMessage("Failed to initiate OAuth. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleWalletChange = async (username: string) => {
    if (!isConnected) {
      try {
        connect({
          connector: injected(), // Assuming the first connector is the one you want to use
        });
      } catch (error) {
        console.error('Error connecting wallet:', error);
        return;
      }
    }
  
    if (!address) {
      console.error('No wallet address available');
      return;
    }
  
    try {
      const newVotingWeight = await checkVotingEligibility(address);
      if (newVotingWeight !== votingWeight) {
        if (newVotingWeight === 0) {
          await removeVotes(username);
        }
      }
  
      const response = await fetch(`/api/users/${username}/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });
  
      if (response.ok) {
        const { isMiladyOG } = await response.json();
        mutate(currentUsers =>
          Array.isArray(currentUsers)
            ? currentUsers.map(user =>
              user.username === username
                ? { ...user, isMiladyOG, walletAddress: address }
                : user
            )
            : currentUsers,
          false
        );
      } else {
        throw new Error('Failed to update wallet');
      }
    } catch (error) {
      console.error('Error updating wallet:', error);
    }
  };

  useEffect(() => {
    if (users) {
      console.log('Raw user data:', JSON.stringify(users, null, 2));
    }
  }, [users]);

useEffect(() => {
  console.log('UserTable: Connection status changed', { isConnected, address, eligible, votingWeight });
  if (isConnected && address) {
    checkEligibility();
  }
}, [isConnected, address, eligible, votingWeight, checkEligibility]);


  return (
    <div className="w-full max-w-7xl mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <Button
            color="primary"
            className="bg-blue-100 text-blue-500 mr-2"
            onClick={handleSubmitAccountClick}
          >
            Submit Account
          </Button>
          <Button
            color="secondary"
            className="bg-blue-100 text-blue-500"
            onClick={() => {
              setSelectedUserId(users && users.length > 0 ? users[0].username : null);
              setIsModalOpen(true);
            }}
          >
            Claim Account
          </Button>
        </div>
        <div className="flex items-center">
          <Input
            isClearable
            className="w-full max-w-xs mb-2"
            placeholder="Search..."
            value={search}
            onValueChange={setSearch}
          />
          <Button
            color="primary"
            className="ml-2"
            onClick={() => setIsFilterModalOpen(true)}
          >
            Filter
          </Button>
        </div>
      </div>
      <Table
        aria-label="User table"
        className="h-auto min-w-full nextui-table"
        selectionMode="none"
      >
        <TableHeader>
          <TableColumn>NAME</TableColumn>
          <TableColumn>TWITTER ACCOUNT</TableColumn>
          <TableColumn>APPROVAL STATUS BY COMMUNITY</TableColumn>
          <TableColumn>CREDIT SCORE</TableColumn>
        </TableHeader>
        <TableBody
          items={paginatedUsers}
          emptyContent={
            isLoadingUsers ? (
              <Spinner />
            ) : noUsersAvailable ? (
              "There are currently no users available."
            ) : (
              "No users match the current filters."
            )
          }
        >
          {(item) => (
            <TableRow key={item.username}>
              <TableCell>
                <div className="flex items-center">
                  <User
                    name={
                      <div className="checkmark-container">
                        {item.display_name}
                        {item.isClaimed && (
                          <CheckBadgeIcon className="checkmark-icon text-blue-500" />
                        )}
                      </div>
                    }
                    description={
                      <div className="text-xs">
                        Followers: {formatFollowers(item.followers)}
                      </div>
                    }
                    avatarProps={{
                      src: item.pfp_url,
                      size: "lg",
                      radius: "full",
                      className: "object-cover w-14 h-14",
                    }}
                  />
                </div>
              </TableCell>
              <TableCell>@{item.username}</TableCell>
              <TableCell>
                <UserStatusBadge
                  status={getStatus(item.score?.up, item.score?.down)}
                  isMiladyOG={item.isMiladyOG}
                  isRemiliaOfficial={item.isRemiliaOfficial}
                />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2 credit-score">
                  <Button size="sm" className="nextui-button-chip thumbs-up" onClick={() => handleThumbsUp(item.username)} disabled={votingWeight === 0}>
                    👍 <span className="ml-1">{item.score?.up}</span>
                  </Button>
                  <Button size="sm" className="nextui-button-chip thumbs-down" onClick={() => handleThumbsDown(item.username)} disabled={votingWeight === 0}>
                    👎 <span className="ml-1">{item.score?.down}</span>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <Pagination
        total={Math.max(1, Math.ceil(sortedUsers.length / itemsPerPage))}
        initialPage={1}
        page={page}
        onChange={(newPage) => setPage(newPage)}
        className="mt-4"
        hidden={sortedUsers.length <= itemsPerPage}
      />
      <Modal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
      >
        <ModalContent>
          <ModalHeader>
            <h3>Filter Users</h3>
          </ModalHeader>
          <ModalBody>
            <Select
              label="Select Filter"
              placeholder="Choose a filter"
              onChange={(e) => setFilter(e.target.value)}
            >
              <SelectItem key="followers">Followers</SelectItem>
              <SelectItem key="nameAsc">Name A-Z</SelectItem>
              <SelectItem key="nameDesc">Name Z-A</SelectItem>
              <SelectItem key="approvalRateAsc">
                Approval Rate Ascending
              </SelectItem>
              <SelectItem key="approvalRateDesc">
                Approval Rate Descending
              </SelectItem>
              <SelectItem key="statusApproved">
                <Chip color="success" variant="flat" className="mr-2">
                  Approved
                </Chip>
              </SelectItem>
              <SelectItem key="statusModerate">
                <Chip color="warning" variant="flat" className="mr-2">
                  Moderate
                </Chip>
              </SelectItem>
              <SelectItem key="statusRisk">
                <Chip color="danger" variant="flat" className="mr-2">
                  Risk
                </Chip>
              </SelectItem>
              <SelectItem key="remiliaOfficial">
                <Chip color="secondary" variant="flat" className="mr-2">
                  Remilia Official
                </Chip>
              </SelectItem>
              <SelectItem key="miladyOG">
                <Chip color="primary" variant="flat" className="mr-2">
                  Milady OG
                </Chip>
              </SelectItem>
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button onClick={() => setIsFilterModalOpen(false)}>Close</Button>
            <Button onClick={applyFilter}>Apply</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal
        isOpen={isSubmitModalVisible}
        onClose={() => setIsSubmitModalVisible(false)}
        className="submit-account-modal"
      >
        <ModalContent>
          <ModalHeader>Submit Account</ModalHeader>
          <ModalBody>
            <p>Please provide the link to the account you wish to submit.</p>
            <div className="flex items-center">
              <span>https://twitter.com/</span>
              <Input
                placeholder="username"
                value={twitterUsername}
                onChange={(e) => setTwitterUsername(e.target.value)}
                className="twitter-username-input h-10 ml-2"
              />
            </div>
            {submitModalMessage && (
              <div className="mt-4 text-center">
                <Spinner size="sm" />
                <span className="ml-2">{submitModalMessage}</span>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button color="danger" variant="light" onPress={() => setIsSubmitModalVisible(false)}>
              Cancel
            </Button>
            <Button color="primary" onPress={handleSubmitAccount} disabled={isProcessing || !twitterUsername}>
              Submit
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <LoadingModal isLoading={isLoadingModalVisible} message={loadingModalMessage} isSuccess={isLoadingSuccess} />

      <TwitterAuthModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAuthenticate={() => {
          if (selectedUserId) {
            handleClaimAccount(selectedUserId);
          }
        }}
      >
        {errorMessage && (
          <div className="text-red-500 mt-2">
            <span>❌ {errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="text-green-500 mt-2">
            <span>✅ {successMessage}</span>
          </div>
        )}
      </TwitterAuthModal>
      {(errorMessage || successMessage) && (
        <div className="fixed bottom-4 left-4 bg-white shadow-md rounded-lg p-4">
          {errorMessage && <span className="text-red-500">❌ {errorMessage}</span>}
          {successMessage && <span className="text-green-500">✅ {successMessage}</span>}
        </div>
      )}
    </div>
  );
};

const LoadingModal: React.FC<{ isLoading: boolean; message: string; isSuccess: boolean }> = ({ isLoading, message, isSuccess }) => {
  if (!isLoading) return null;

  return (
    <div className="fixed bottom-4 left-4 bg-white shadow-md rounded-lg p-4 flex items-center">
      {isSuccess ? (
        <CheckBadgeIcon className="h-5 w-5 text-green-500 mr-2" />
      ) : (
        <Spinner size="sm" />
      )}
      <span className={`ml-2 ${isSuccess ? 'text-green-500' : ''}`}>{message}</span>
    </div>
  );
};

export default UserTable;

