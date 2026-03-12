import * as React from 'react';
import type { IHrWebPartProps } from './IHrWebPartProps';
import App from './App';

export default class HrWebPart extends React.Component<IHrWebPartProps, {}> {
  public render(): React.ReactElement<IHrWebPartProps> {
    const { userDisplayName, context } = this.props;
    return <App userDisplayName={userDisplayName} context={context} />;
  }
}