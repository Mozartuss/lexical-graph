import { Result, Typography } from 'antd';
import React from 'react';

function EmptyResult({ word }: { word: string }): React.JSX.Element {
  const message = (
    <Typography.Text>
      The word &quot;
      {word}
      &quot; was not found in WordNet.
    </Typography.Text>
  );
  return (
    <Result
      status="warning"
      title={`"${word}"`}
      extra={message}
    />
  );
}

export default EmptyResult;
