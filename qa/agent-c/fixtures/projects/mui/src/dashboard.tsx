import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Paper from "@mui/material/Paper"
import Grid from "@mui/material/Grid"
import Chip from "@mui/material/Chip"
import CircularProgress from "@mui/material/CircularProgress"

export function Dashboard() {
  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom>Dashboard</Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Paper elevation={2} sx={{ p: 2 }}>
            <Typography variant="h6">Metric A</Typography>
            <Typography variant="h3">1,234</Typography>
            <Chip label="Active" color="success" size="small" />
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper elevation={2} sx={{ p: 2 }}>
            <CircularProgress />
            <Typography variant="body2">Loading...</Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}
