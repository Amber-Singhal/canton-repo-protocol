import React from 'react';
import { useParty, useStreamQueries } from '@c7/react';
import {
  Box,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  Tooltip,
} from '@mui/material';
import { green, grey } from '@mui/material/colors';
import { Repo, MaturedRepo } from '@canton-repo-protocol/daml.js/canton-repo-protocol-0.1.0/lib/Repo/Repo';

// Helper function to format decimal repo rate into a percentage string
const formatRate = (rate: string): string => {
  const numericRate = parseFloat(rate) * 100;
  return `${numericRate.toFixed(2)}%`;
};

// Helper function to format decimal amount with commas
const formatAmount = (amount: string): string => {
  return parseFloat(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Helper to determine the counterparty from the user's perspective
const getCounterparty = (party: string, cashProvider: string, collateralProvider: string): string => {
  return party === cashProvider ? collateralProvider : cashProvider;
};

const BlotterTable = <T extends { payload: any; contractId: string }>({
  title,
  contracts,
  party,
  isMatured = false,
}: {
  title: string;
  contracts: readonly T[];
  party: string;
  isMatured?: boolean;
}) => (
  <Box mt={4}>
    <Typography variant="h6" gutterBottom component="div">
      {title}
    </Typography>
    <TableContainer component={Paper}>
      <Table sx={{ minWidth: 650 }} aria-label={`${title} table`}>
        <TableHead>
          <TableRow sx={{ backgroundColor: grey[100] }}>
            <TableCell>Trade ID</TableCell>
            <TableCell>Counterparty</TableCell>
            <TableCell>Collateral ISIN</TableCell>
            <TableCell align="right">Collateral Qty</TableCell>
            <TableCell align="right">Cash Amount</TableCell>
            <TableCell align="right">Repo Rate</TableCell>
            <TableCell>Trade Date</TableCell>
            <TableCell>Maturity Date</TableCell>
            {isMatured && <TableCell>Matured On</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {contracts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={isMatured ? 9 : 8} align="center" sx={{ color: grey[500] }}>
                No {title.toLowerCase()} found.
              </TableCell>
            </TableRow>
          ) : (
            contracts.map((c) => (
              <TableRow key={c.contractId} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                <TableCell component="th" scope="row">
                  <Tooltip title={c.payload.tradeId} placement="top">
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.payload.tradeId}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell>{getCounterparty(party, c.payload.cashProvider, c.payload.collateralProvider)}</TableCell>
                <TableCell>{c.payload.collateral.isin}</TableCell>
                <TableCell align="right">{parseInt(c.payload.collateral.quantity, 10).toLocaleString()}</TableCell>
                <TableCell align="right">{formatAmount(c.payload.cashAmount)}</TableCell>
                <TableCell align="right">{formatRate(c.payload.repoRate)}</TableCell>
                <TableCell>{c.payload.tradeDate}</TableCell>
                <TableCell>{c.payload.maturityDate}</TableCell>
                {isMatured && <TableCell>{c.payload.maturedOn}</TableCell>}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  </Box>
);

export const RepoBlotter: React.FC = () => {
  const party = useParty();
  const { contracts: openRepos, loading: loadingOpen } = useStreamQueries(Repo);
  const { contracts: maturedRepos, loading: loadingMatured } = useStreamQueries(MaturedRepo);

  if (loadingOpen || loadingMatured) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
        <Typography ml={2}>Loading trades...</Typography>
      </Box>
    );
  }

  // Sort trades by trade date, most recent first
  const sortedOpenRepos = [...openRepos].sort((a, b) => new Date(b.payload.tradeDate).getTime() - new Date(a.payload.tradeDate).getTime());
  const sortedMaturedRepos = [...maturedRepos].sort((a, b) => new Date(b.payload.tradeDate).getTime() - new Date(a.payload.tradeDate).getTime());

  return (
    <Box sx={{ padding: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1">
          Repo Blotter
        </Typography>
        <Chip label={`Viewing as: ${party}`} color="primary" variant="outlined" />
      </Box>

      <BlotterTable
        title="Open Positions"
        contracts={sortedOpenRepos}
        party={party}
      />

      <BlotterTable
        title="Matured Trades"
        contracts={sortedMaturedRepos}
        party={party}
        isMatured
      />
    </Box>
  );
};