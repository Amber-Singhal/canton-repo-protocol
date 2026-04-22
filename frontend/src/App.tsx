import React, { useState, useEffect, useCallback } from 'react';
import { DamlLedger, useParty, useLedger, useStreamQueries } from '@c7/react';
import {
  AppBar,
  Box,
  Button,
  Container,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Paper,
  TextField,
  Toolbar,
  Typography,
  ThemeProvider,
  createTheme
} from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { RepoBlotter } from './RepoBlotter';
import { Agreement, Proposal } from '@daml.js/canton-repo-protocol-0.1.0/lib/Repo/Model'; // Assuming this path for generated types
import { Party } from '@daml/types';
import { addDays } from 'date-fns';

type Credentials = {
  party: Party;
  token: string;
};

const theme = createTheme({
  palette: {
    primary: {
      main: '#003366', // A professional, finance-appropriate blue
    },
    secondary: {
      main: '#4A90E2',
    },
    background: {
      default: '#f4f6f8',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h5: {
      fontWeight: 500,
    },
  },
});

const REPO_PROTOCOL_VERSION = "0.1.0";
const ledgerUrl = 'http://localhost:7575'; // Default JSON API URL

//-------------------------------------------------------------------------------------------------
// Login Screen Component
//-------------------------------------------------------------------------------------------------

const LoginScreen: React.FC<{ onLogin: (creds: Credentials) => void }> = ({ onLogin }) => {
  const [party, setParty] = useState('');
  const [token, setToken] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, you would fetch the token from an auth service.
    // Here we assume the user has a long-lived development token.
    const trimmedParty = party.trim();
    const trimmedToken = token.trim();

    if (!trimmedParty || !trimmedToken) {
      alert("Please provide both a Party ID and a JWT token.");
      return;
    }
    
    onLogin({ party: trimmedParty, token: trimmedToken });
  };

  const handleUseAlice = () => {
    setParty('Alice::12200a7b05e0468f5664187e1f14819a165977a4143a41bf30554c619b0277c00e12');
    setToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwczovL2RhbWwuY29tL2xlZGdlci1hcGkiOnsibGVkZ2VySWQiOiJteWxvY2FsbGVkZ2VyIiwiYXBwbGljYXRpb25JZCI6ImZvb2JhciIsInBhcnR5IjoiQWxpY2U6OjEyMjAwYTdiMDVlMDQ2OGY1NjY0MTg3ZTFmMTE0ODE5YTE2NTk3N2E0MTQzYTQxYmYzMDU1NGM2MTliMDI3N2MwMGUxMiJ9fQ.T_15yKOFpMhM8t0pB_vM5eTJW3ZoqF2wHqmlqs35k6k');
  };

  const handleUseBob = () => {
    setParty('Bob::12208a7b05e0468f5664187e1f14819a165977a4143a41bf30554c619b0277c00e12');
    setToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwczovL2RhbWwuY29tL2xlZGdlci1hcGkiOnsibGVkZ2VySWQiOiJteWxvY2FsbGVkZ2VyIiwiYXBwbGljYXRpb25JZCI6ImZvb2JhciIsInBhcnR5IjoiQm9iOjoxMjIwOGE3YjA1ZTA0NjhmNTY2NDE4N2UxZjE0ODE5YTE2NTk3N2E0MTQzYTQxYmYzMDU1NGM2MTliMDI3N2MwMGUxMiJ9fQ.u1t-rWwz_k1g2-5C2vA7XNCf59M09z71o3j2ZMiyvDk');
  };


  return (
    <Container component="main" maxWidth="xs">
      <CssBaseline />
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography component="h1" variant="h5">
          Canton Repo Protocol Portal
        </Typography>
        <Box component="form" onSubmit={handleLogin} noValidate sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="party"
            label="Party ID"
            name="party"
            autoFocus
            value={party}
            onChange={(e) => setParty(e.target.value)}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="token"
            label="DAML Ledger JWT Token"
            type="password"
            id="token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }}>
            Log In
          </Button>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Button fullWidth variant="outlined" onClick={handleUseAlice}>Use Alice</Button>
            </Grid>
            <Grid item xs={6}>
              <Button fullWidth variant="outlined" onClick={handleUseBob}>Use Bob</Button>
            </Grid>
          </Grid>
        </Box>
      </Box>
    </Container>
  );
};


//-------------------------------------------------------------------------------------------------
// New Repo Modal Component
//-------------------------------------------------------------------------------------------------

interface NewRepoModalProps {
    open: boolean;
    onClose: () => void;
}

const NewRepoModal: React.FC<NewRepoModalProps> = ({ open, onClose }) => {
    const party = useParty();
    const ledger = useLedger();
    
    const [counterparty, setCounterparty] = useState('');
    const [isin, setIsin] = useState('US912828U435'); // Default to a common T-bill
    const [quantity, setQuantity] = useState('1000000.0');
    const [ccy, setCcy] = useState('USD');
    const [principal, setPrincipal] = useState('995000.0');
    const [rate, setRate] = useState('5.25');
    const [startDate, setStartDate] = useState<Date | null>(new Date());
    const [term, setTerm] = useState<string>("ON"); // ON, TN, SN, 1W, 2W, 1M

    const getMaturityDate = (start: Date, term: string): Date => {
        switch (term) {
            case 'ON': return addDays(start, 1);
            case 'TN': return addDays(start, 2);
            case 'SN': return addDays(start, 3);
            case '1W': return addDays(start, 7);
            case '2W': return addDays(start, 14);
            case '1M': return addDays(start, 30);
            default: return addDays(start, 1);
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!party || !counterparty || !isin || !startDate || !principal || !rate || !quantity) {
            alert("Please fill in all fields.");
            return;
        }

        const maturityDate = getMaturityDate(startDate, term);
        const repoRate = (parseFloat(rate) / 100.0).toFixed(10); // Convert percentage to decimal string
        
        const proposalPayload = {
            proposer: party,
            counterparty: counterparty,
            terms: {
                provider: party, // The proposer provides cash in this example flow
                collateralPledger: counterparty,
                collateral: { isin, quantity: quantity, ccy },
                principal: { amount: principal, ccy },
                rate: repoRate,
                startDate: startDate.toISOString().split('T')[0],
                maturityDate: maturityDate.toISOString().split('T')[0],
            },
        };

        try {
            await ledger.create(Proposal, proposalPayload);
            onClose(); // Close modal on success
        } catch (error) {
            console.error("Failed to create repo proposal:", error);
            alert(`Error: ${error}`);
        }
    };


    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Propose New Repo Trade</DialogTitle>
            <DialogContent>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={12}>
                        <TextField fullWidth label="Counterparty Party ID" value={counterparty} onChange={e => setCounterparty(e.target.value)} required />
                    </Grid>
                    <Grid item xs={8}>
                        <TextField fullWidth label="Collateral ISIN" value={isin} onChange={e => setIsin(e.target.value)} required />
                    </Grid>
                     <Grid item xs={4}>
                        <TextField fullWidth label="Collateral Ccy" value={ccy} onChange={e => setCcy(e.target.value)} required />
                    </Grid>
                    <Grid item xs={6}>
                        <TextField fullWidth label="Collateral Quantity" type="number" value={quantity} onChange={e => setQuantity(e.target.value)} required />
                    </Grid>
                    <Grid item xs={6}>
                        <TextField fullWidth label="Principal Amount" type="number" value={principal} onChange={e => setPrincipal(e.target.value)} required />
                    </Grid>
                    <Grid item xs={4}>
                         <TextField fullWidth label="Repo Rate (%)" type="number" value={rate} onChange={e => setRate(e.target.value)} required />
                    </Grid>
                    <Grid item xs={4}>
                        <LocalizationProvider dateAdapter={AdapterDateFns}>
                            <DatePicker
                                label="Start Date"
                                value={startDate}
                                onChange={setStartDate}
                                slotProps={{ textField: { fullWidth: true } }}
                            />
                        </LocalizationProvider>
                    </Grid>
                    <Grid item xs={4}>
                         <TextField select fullWidth label="Term" value={term} onChange={e => setTerm(e.target.value)} SelectProps={{ native: true }}>
                            <option value="ON">Overnight (O/N)</option>
                            <option value="TN">Tom-Next (T/N)</option>
                            <option value="SN">Spot-Next (S/N)</option>
                            <option value="1W">1 Week</option>
                            <option value="2W">2 Weeks</option>
                            <option value="1M">1 Month</option>
                        </TextField>
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSubmit} variant="contained">Propose</Button>
            </DialogActions>
        </Dialog>
    );
};


//-------------------------------------------------------------------------------------------------
// Main Application Layout
//-------------------------------------------------------------------------------------------------

const MainLayout: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
    const party = useParty();
    const [isNewRepoModalOpen, setNewRepoModalOpen] = useState(false);

    // Stream queries for proposals and agreements
    const proposals = useStreamQueries(Proposal);
    const agreements = useStreamQueries(Agreement);

    return (
        <Box sx={{ display: 'flex' }}>
            <CssBaseline />
            <AppBar position="absolute">
                <Toolbar>
                    <Typography component="h1" variant="h6" color="inherit" noWrap sx={{ flexGrow: 1 }}>
                        Canton Repo Protocol Desk - v{REPO_PROTOCOL_VERSION}
                    </Typography>
                    <Typography variant="subtitle1" sx={{ mr: 2 }}>
                        {party}
                    </Typography>
                    <Button color="inherit" onClick={onLogout}>
                        Logout
                    </Button>
                </Toolbar>
            </AppBar>
            <Box
                component="main"
                sx={{
                    backgroundColor: (theme) => theme.palette.background.default,
                    flexGrow: 1,
                    height: '100vh',
                    overflow: 'auto',
                }}
            >
                <Toolbar />
                <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="h5">
                                Repo Blotter
                            </Typography>
                             <Button
                                variant="contained"
                                onClick={() => setNewRepoModalOpen(true)}
                            >
                                Propose New Repo
                            </Button>
                        </Box>
                        <RepoBlotter
                          proposals={proposals.contracts}
                          agreements={agreements.contracts}
                          loading={proposals.loading || agreements.loading}
                        />
                    </Paper>
                </Container>
            </Box>
            <NewRepoModal
                open={isNewRepoModalOpen}
                onClose={() => setNewRepoModalOpen(false)}
            />
        </Box>
    );
};


//-------------------------------------------------------------------------------------------------
// Top-level App Component
//-------------------------------------------------------------------------------------------------

const App: React.FC = () => {
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  const handleLogin = useCallback((creds: Credentials) => {
    setCredentials(creds);
  }, []);

  const handleLogout = useCallback(() => {
    setCredentials(null);
  }, []);

  useEffect(() => {
    const handlePopstate = () => {
      handleLogout();
    };
    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  }, [handleLogout]);


  if (!credentials) {
    return <ThemeProvider theme={theme}><LoginScreen onLogin={handleLogin} /></ThemeProvider>;
  }

  return (
    <ThemeProvider theme={theme}>
      <DamlLedger token={credentials.token} party={credentials.party} httpBaseUrl={ledgerUrl}>
        <MainLayout onLogout={handleLogout} />
      </DamlLedger>
    </ThemeProvider>
  );
};

export default App;