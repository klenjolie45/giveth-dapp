import React, { Fragment, useContext } from 'react';
import PropTypes from 'prop-types';
import { message } from 'antd';

import MilestoneService from 'services/MilestoneService';
import Milestone from 'models/Milestone';
import GA from 'lib/GoogleAnalytics';
import { checkBalance, actionWithLoggedIn } from 'lib/middleware';
import { Context as Web3Context } from '../contextProviders/Web3Provider';
import DonationService from '../services/DonationService';
import LPMilestone from '../models/LPMilestone';
import config from '../configuration';
import { Context as UserContext } from '../contextProviders/UserProvider';
import { Context as WhiteListContext } from '../contextProviders/WhiteListProvider';
import ErrorHandler from '../lib/ErrorHandler';
import BridgedMilestone from '../models/BridgedMilestone';
import LPPCappedMilestone from '../models/LPPCappedMilestone';

const WithdrawMilestoneFundsButton = ({ milestone, isAmountEnoughForWithdraw }) => {
  const {
    state: { currentUser },
  } = useContext(UserContext);
  const {
    state: { isForeignNetwork, balance },
    actions: { displayForeignNetRequiredWarning },
  } = useContext(Web3Context);
  const {
    state: { minimumPayoutUsdValue },
  } = useContext(WhiteListContext);

  async function withdraw() {
    const userAddress = currentUser.address;
    const isRecipient = milestone.recipientAddress === userAddress;
    actionWithLoggedIn(currentUser).then(() =>
      Promise.all([
        checkBalance(balance),
        DonationService.getMilestoneDonationsCount(milestone._id),
      ])
        .then(([, donationsCount]) => {
          if (!isAmountEnoughForWithdraw) {
            message.error(
              `Oh No!
                A minimum donation balance of
                ${minimumPayoutUsdValue} USD  is required before
                you can collect or disperse the funds. This is a
                 temporary limitation due to Ethereum Mainnet issues.`,
            );
            return;
          }
          React.swal({
            title: isRecipient ? 'Withdrawal Funds to Wallet' : 'Disburse Funds to Recipient',
            content: React.swal.msg(
              <div>
                <p>
                  We will initiate the transfer of the funds to{' '}
                  {milestone instanceof LPMilestone && 'the Campaign.'}
                  {!(milestone instanceof LPMilestone) &&
                    (isRecipient ? 'your wallet.' : "the recipient's wallet.")}
                </p>
                {donationsCount > config.donationCollectCountLimit && (
                  <div className="alert alert-warning">
                    <strong>Note:</strong> Due to the current gas limitations you may be required to
                    withdrawal multiple times. You have <strong>{donationsCount}</strong> donations
                    to {isRecipient ? 'withdraw' : 'disburse'}. At each try donations from{' '}
                    <strong>{config.donationCollectCountLimit}</strong> different sources can be
                    paid.
                  </div>
                )}
                {!(milestone instanceof LPMilestone) && (
                  <div className="alert alert-warning">
                    Note: For security reasons, there is a delay of approximately 72 hrs before the
                    funds will appear in {isRecipient ? 'your' : "the recipient's"} wallet.
                  </div>
                )}
              </div>,
            ),
            icon: 'warning',
            dangerMode: true,
            buttons: ['Cancel', 'Yes, withdrawal'],
          }).then(isConfirmed => {
            if (isConfirmed) {
              MilestoneService.withdraw({
                milestone,
                from: userAddress,
                onTxHash: txUrl => {
                  GA.trackEvent({
                    category: 'Milestone',
                    action: 'initiated withdrawal',
                    label: milestone._id,
                  });

                  React.toast.info(
                    <p>
                      Initiating withdrawal from Milestone...
                      <br />
                      <a href={txUrl} target="_blank" rel="noopener noreferrer">
                        View transaction
                      </a>
                    </p>,
                  );
                },
                onConfirmation: txUrl => {
                  React.toast.info(
                    <p>
                      The Milestone withdraw has been initiated...
                      <br />
                      <a href={txUrl} target="_blank" rel="noopener noreferrer">
                        View transaction
                      </a>
                    </p>,
                  );
                },
                onError: (err, txUrl) => {
                  let msg;
                  if (err === 'patch-error') {
                    ErrorHandler(err, 'Issue on connecting server and pushing updates');
                  } else if (err.message === 'no-donations') {
                    msg = <p>Nothing to withdraw. There are no donations to this Milestone.</p>;
                  } else if (txUrl) {
                    // TODO: need to update feathers to reset the donations to previous state as this
                    // tx failed.
                    msg = (
                      <p>
                        Something went wrong with the transaction.
                        <br />
                        <a href={txUrl} target="_blank" rel="noopener noreferrer">
                          View transaction
                        </a>
                      </p>
                    );
                  } else {
                    msg = <p>Something went wrong with the transaction.</p>;
                  }

                  React.swal({
                    title: 'Oh no!',
                    content: React.swal.msg(msg),
                    icon: 'error',
                  });
                },
              });
            }
          });
        })
        .catch(err => {
          if (err === 'noBalance') {
            ErrorHandler(err, 'There is no balance left on the account.', true);
          } else if (err !== undefined) {
            ErrorHandler(err, 'Something went wrong.', true);
          }
        }),
    );
  }

  const userAddress = currentUser.address;

  return (
    <Fragment>
      {milestone.canUserWithdraw(currentUser) && (
        <button
          type="button"
          className="btn btn-success btn-sm withdraw"
          onClick={() => (isForeignNetwork ? withdraw() : displayForeignNetRequiredWarning())}
        >
          <i className="fa fa-usd" />{' '}
          {milestone.recipientAddress === userAddress ? 'Collect' : 'Disburse'}
        </button>
      )}
    </Fragment>
  );
};

WithdrawMilestoneFundsButton.propTypes = {
  milestone: PropTypes.oneOfType(
    [Milestone, BridgedMilestone, LPPCappedMilestone, LPMilestone].map(PropTypes.instanceOf),
  ).isRequired,
  isAmountEnoughForWithdraw: PropTypes.bool.isRequired,
};

export default React.memo(WithdrawMilestoneFundsButton);
