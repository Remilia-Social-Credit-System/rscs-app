'use client'

import React, { useState, useEffect } from "react";
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
import { CheckBadgeIcon } from '@heroicons/react/24/solid';
import TwitterAuthModal from './TwitterAuthModal';
import { useSearchParams } from 'next/navigation';
import { useAccount } from 'wagmi';
import { checkVotingEligibility } from '../lib/checkBalance';
import useSWR from 'swr';

// Define UserData interface here instead of importing from InitialUserData
interface UserData {
  id: string;
  name: string;
  username: string;
  followers: number;
  avatarUrl: string;
  status: string;
  isMiladyOG?: boolean;
  isRemiliaOfficial?: boolean;
  score: {
    up: number;
    down: number;
  };
  hasGoldenBadge?: boolean;
  isClaimed?: boolean;
}

// Utility functions
const formatFollowers = (followers: number | undefined | null) => {
  if (followers === undefined || followers === null) {
    return "N/A";
  }
  if (followers >= 1000) {
    return (followers / 1000).toFixed(1) + "K";
  }
  return followers.toLocaleString();
};

const calculateApprovalRate = (likes: number, dislikes: number) => {
  const totalVotes = likes + dislikes;
  return totalVotes === 0 ? 0 : (likes / totalVotes) * 100;
};

const getStatus = (likes: number, dislikes: number) => {
  const approvalRate = calculateApprovalRate(likes, dislikes);
  if (approvalRate >= 70) return "Approved";
  if (approvalRate >= 40) return "Moderate";
  return "Risk";
};

const isGoldCheckmarkEligible = (user: UserData) => {
  const totalVotes = user.score.up + user.score.down;
  const approvalRate = calculateApprovalRate(user.score.up, user.score.down);
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
  const [votingWeight, setVotingWeight] = useState<number>(0);
  const { address } = useAccount();
  const searchParams = useSearchParams();
  const auth = searchParams.get('auth');
  const authError = searchParams.get('error');
  const { data: users, error: fetchError, isLoading, mutate } = useSWR<UserData[]>('/api/fetch', fetcher);

  // Handle auth and error messages
  useEffect(() => {
    if (auth === 'success') {
      setSuccessMessage('Account successfully claimed!');
    } else if (authError) {
      setErrorMessage(authError);
    }
  }, [auth, authError]);

  useEffect(() => {
    if (address) {
      checkVotingEligibility(address).then(setVotingWeight);
    }
  }, [address]);

  // Filter users based on search input
  const filteredUsers = Array.isArray(users)
    ? users.filter(
      (user: UserData) =>
        user.name.toLowerCase().includes(search.toLowerCase()) ||
        user.username.toLowerCase().includes(search.toLowerCase())
    )
    : [];

  // Sort users based on the selected filter
  const sortUsers = (users: UserData[]) => {
    switch (filter) {
      case "followers":
        return users.sort((a, b) => b.followers - a.followers);
      case "nameAsc":
        return users.sort((a, b) => a.name.localeCompare(b.name));
      case "nameDesc":
        return users.sort((a, b) => b.name.localeCompare(a.name));
      case "approvalRateAsc":
        return users.sort(
          (a, b) =>
            calculateApprovalRate(a.score.up, a.score.down) -
            calculateApprovalRate(b.score.up, b.score.down)
        );
      case "approvalRateDesc":
        return users.sort(
          (a, b) =>
            calculateApprovalRate(b.score.up, b.score.down) -
            calculateApprovalRate(a.score.up, a.score.down)
        );
      case "statusApproved":
        return users.filter(
          (user) => getStatus(user.score.up, user.score.down) === "Approved"
        );
      case "statusModerate":
        return users.filter(
          (user) => getStatus(user.score.up, user.score.down) === "Moderate"
        );
      case "statusRisk":
        return users.filter(
          (user) => getStatus(user.score.up, user.score.down) === "Risk"
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

  // Handle thumbs up action
  const handleThumbsUp = async (username: string) => {
    try {
      const response = await fetch(`/api/users/${username}/upvote`, { method: 'POST' });
      if (!response.ok) {
        throw new Error('Failed to upvote');
      }
      const updatedUser = await response.json();
      mutate(currentUsers =>
        Array.isArray(currentUsers)
          ? currentUsers.map(user => user.username === username ? updatedUser : user)
          : currentUsers,
        false
      );
    } catch (error) {
      console.error('Error upvoting:', error);
    }
  };

  // Handle thumbs down action
  const handleThumbsDown = async (username: string) => {
    handleVote(username, false);
  };

  // Handle vote action
  const handleVote = async (username: string, isUpvote: boolean) => {
    if (!address || votingWeight === 0) return;

    try {
      const response = await fetch(`/api/users/${username}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isUpvote, weight: votingWeight }),
      });
      if (!response.ok) throw new Error('Failed to vote');
      const { user: updatedUser } = await response.json();
      mutate(currentUsers =>
        Array.isArray(currentUsers)
          ? currentUsers.map(user => user.username === username ? updatedUser : user)
          : currentUsers,
        false
      );
    } catch (error) {
      console.error('Error voting:', error);
    }
  };

  // Apply filter and close modal
  const applyFilter = () => {
    setIsFilterModalOpen(false);
  };

  // Handle submit account action
  const handleSubmitAccount = async () => {
    setIsProcessing(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      // Check if the user already exists in the database
      const userExists = users?.some(user => user.username === twitterUsername);
      if (userExists) {
        setErrorMessage("This user is already in the database!");
        setIsProcessing(false);
        return;
      }

      // Submit the user to the database
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: twitterUsername }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit account');
      }

      // Add the new user to the state
      const newUser = await response.json();
      mutate(currentUsers =>
        Array.isArray(currentUsers)
          ? [...currentUsers, newUser]
          : [newUser],
        false
      );

      setSuccessMessage("✅ Success - Milady has been added");
      setTimeout(() => {
        setIsSubmitModalOpen(false);
        setTwitterUsername("");
        setSuccessMessage("");
      }, 2000); // Close the modal after 2 seconds
    } catch (error) {
      console.error('Error submitting account:', error);
      setErrorMessage("Failed to submit account. Please try again.");
    } finally {
      setIsProcessing(false);
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

  return (
    <div className="w-full max-w-7xl mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <Button
            color="primary"
            className="bg-blue-100 text-blue-500 mr-2"
            onClick={() => setIsSubmitModalOpen(true)}
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
            isLoading ? (
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
                        {item.name}
                        {isGoldCheckmarkEligible(item) && (
                          <CheckBadgeIcon className="checkmark-icon text-yellow-500" />
                        )}
                        {item.isClaimed && (
                          <CheckBadgeIcon className="checkmark-icon text-blue-500" />
                        )}
                      </div>
                    }
                    description={`Followers: ${formatFollowers(item.followers)}`}
                    avatarProps={{
                      src: item.avatarUrl,
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
                  status={getStatus(item.score.up, item.score.down)}
                  isMiladyOG={item.isMiladyOG}
                  isRemiliaOfficial={item.isRemiliaOfficial}
                />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2 credit-score">
                  <Button size="sm" className="nextui-button-chip thumbs-up" onClick={() => handleThumbsUp(item.username)} disabled={votingWeight === 0}>
                    👍 <span className="ml-1">{item.score.up}</span>
                  </Button>
                  <Button size="sm" className="nextui-button-chip thumbs-down" onClick={() => handleThumbsDown(item.username)} disabled={votingWeight === 0}>
                    👎 <span className="ml-1">{item.score.down}</span>
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
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
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
            {errorMessage && (
              <div className="text-red-500 mt-2">
                <span>❌ {errorMessage}</span>
              </div>
            )}
            {isProcessing && (
              <div className="flex items-center justify-center mt-4">
                <Spinner size="sm" />
                <span className="ml-2">Processing...</span>
              </div>
            )}
            {successMessage && (
              <div className="text-green-500 mt-2">
                <span>{successMessage}</span>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button color="danger" variant="light" onPress={() => setIsSubmitModalOpen(false)}>
              Cancel
            </Button>
            <Button color="primary" onPress={handleSubmitAccount} disabled={isProcessing || !twitterUsername}>
              Submit
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
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
    </div>
  );
};

export default UserTable;
